import { useState, useCallback } from "react";

const SYSTEM_PROMPT = `Eres un agente experto en búsqueda de empleo para Diego Elías, ICI semi senior Santiago Chile.

Perfil del candidato:
- Título: Ingeniero Civil Industrial (UAI), mención TI
- Experiencia: LATAM Airlines (Mejora Continua), Cencosud (Control de Gestión), HP (Trainee)
- Herramientas: Excel Avanzado, SQL Avanzado, Power BI, Python básico, Scrum
- Idiomas: Inglés avanzado

Cargos objetivo (PRIORIDAD):
1. ALTA: Project Manager, Jefe Proyectos, PMO, Mejora Continua, Lean, Excelencia Operacional
2. MEDIA: Business Analyst, Analista Funcional
3. BAJA: BI, Control de Gestión, Data Analyst

Preferencias:
- Sectores: Retail > Tecnología > Logística > Banca > Consultoría > Minería
- Sueldo: $2.000.000 - $2.500.000 líquido
- Empresas grandes o startups con estructura. Evitar pymes informales.

INSTRUCCIONES IMPORTANTES:
1. Usa web_search para buscar ofertas REALES publicadas esta semana en Chile
2. Busca en múltiples portales: getonbrd.com, linkedin.com/jobs, laborum.cl, trabajando.cl, computrabajo.cl
3. Para cada oferta encontrada extrae la URL REAL y COMPLETA de la oferta (no de búsqueda)
4. Solo incluye ofertas con URL real que hayas encontrado en la búsqueda
5. Haz al menos 5 búsquedas distintas antes de responder

Queries de búsqueda sugeridos:
- site:getonbrd.com "project manager" OR "mejora continua" Chile 2025
- site:linkedin.com/jobs "jefe de proyectos" Santiago Chile
- site:laborum.cl "business analyst" Santiago
- site:trabajando.cl "PMO" OR "project manager" Santiago
- site:computrabajo.cl "analista funcional" Santiago Chile

Al terminar responde ÚNICAMENTE con JSON válido:
{
  "ofertas": [
    {
      "id": 1,
      "empresa": "nombre real",
      "sector": "sector",
      "cargo": "título exacto de la oferta",
      "ubicacion": "Santiago, Chile",
      "modalidad": "Presencial | Híbrido | Remoto",
      "rango_sueldo": "monto o No especificado",
      "descripcion": "2-3 líneas basadas en la oferta real",
      "requisitos_clave": ["req1", "req2", "req3"],
      "match_herramientas": ["herramientas de Diego que coinciden"],
      "url": "URL completa y real de la oferta",
      "fuente": "GetOnBoard | LinkedIn | Laborum | Trabajando.com | Computrabajo",
      "publicada": "hoy | hace 1 día | hace 3 días | esta semana",
      "match_score": 75
    }
  ],
  "resumen_mercado": "Una línea sobre el mercado actual"
}`;

const REFINE_PROMPT = (fp, fn, eu) => `Eres un agente de búsqueda laboral para Diego Elías, ICI semi senior Santiago Chile.
Perfil: SQL, Excel, Power BI, Python básico, Inglés avanzado. Exp: LATAM, Cencosud.
Preferencias: PM/Mejora Continua > Business Analyst. Retail > Tech > Logística. Sueldo $2M-$2.5M.

Feedback del usuario:
- LE GUSTARON: ${fp || "ninguno"}
- NO LE GUSTARON: ${fn || "ninguno"}
- NO repetir empresas: ${eu}

Usa web_search para encontrar 5 ofertas NUEVAS ajustadas al feedback con URL real de cada oferta.

Responde SOLO JSON:
{
  "ofertas": [{
    "id":1,"empresa":"","sector":"","cargo":"","ubicacion":"","modalidad":"",
    "rango_sueldo":"","descripcion":"","requisitos_clave":[],"match_herramientas":[],
    "url":"","fuente":"","publicada":"","match_score":75
  }],
  "resumen_mercado":"",
  "aprendizaje":"qué ajustaste según el feedback"
}`;

const matchColor = (s) => {
  if (s >= 80) return { bg: "#052e16", border: "#16a34a", text: "#4ade80" };
  if (s >= 65) return { bg: "#1c1a04", border: "#ca8a04", text: "#facc15" };
  return { bg: "#1a0a0a", border: "#dc2626", text: "#f87171" };
};

const modalidadColor = (m) => {
  if (m === "Remoto") return "#818cf8";
  if (m === "Híbrido") return "#34d399";
  return "#94a3b8";
};

const publicadaColor = (p = "") => {
  const s = p.toLowerCase();
  if (s.includes("hoy") || s.includes("1 día") || s.includes("ayer")) return "#4ade80";
  if (s.includes("2") || s.includes("3")) return "#facc15";
  return "#f87171";
};

async function runWithWebSearch(system, userMessage) {
  let messages = [{ role: "user", content: userMessage }];

  for (let i = 0; i < 12; i++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        system,
        messages,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error("API error: " + err.slice(0, 200));
    }

    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

    if (data.stop_reason === "end_turn") {
      const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
      const clean = text.replace(/```json|```/g, "").trim();
      const start = clean.indexOf('{"ofertas"');
      if (start !== -1) {
        let depth = 0, end = -1;
        for (let j = start; j < clean.length; j++) {
          if (clean[j] === "{") depth++;
          else if (clean[j] === "}") { depth--; if (depth === 0) { end = j; break; } }
        }
        if (end !== -1) return JSON.parse(clean.slice(start, end + 1));
      }
      const match = clean.match(/\{[\s\S]*"ofertas"[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error("No se encontró JSON en la respuesta");
    }

    messages.push({ role: "assistant", content: data.content });

    const toolUses = data.content.filter(b => b.type === "tool_use");
    if (toolUses.length > 0) {
      const toolResults = toolUses.map(b => ({
        type: "tool_result",
        tool_use_id: b.id,
        content: b.output || "Búsqueda ejecutada.",
      }));
      messages.push({ role: "user", content: toolResults });
    } else {
      const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
      const match = text.match(/\{[\s\S]*"ofertas"[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error("El agente no usó web_search ni generó JSON");
    }
  }
  throw new Error("Demasiadas iteraciones sin resultado");
}

export default function JobAgent() {
  const [phase, setPhase] = useState("idle");
  const [jobs, setJobs] = useState([]);
  const [feedback, setFeedback] = useState({});
  const [resumen, setResumen] = useState("");
  const [aprendizaje, setAprendizaje] = useState("");
  const [round, setRound] = useState(0);
  const [allCompanies, setAllCompanies] = useState([]);
  const [agentLog, setAgentLog] = useState([]);
  const [expandedJob, setExpandedJob] = useState(null);

  const addLog = (msg) => setAgentLog(prev => [...prev, {
    time: new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    msg
  }]);

  const buscarOfertas = useCallback(async () => {
    setPhase("loading");
    setAgentLog([]);
    setAprendizaje("");
    addLog("⬡ Iniciando agente...");
    await new Promise(r => setTimeout(r, 200));
    addLog("🔍 Buscando en GetOnBoard, LinkedIn, Laborum, Trabajando.com...");
    await new Promise(r => setTimeout(r, 200));
    addLog("⏳ Navegando portales en tiempo real...");
    try {
      const result = await runWithWebSearch(
        SYSTEM_PROMPT,
        "Busca ofertas reales para Diego en Chile. Usa web_search en múltiples portales y trae URLs directas de cada oferta."
      );
      addLog(`✅ ${result.ofertas?.length || 0} ofertas reales encontradas`);
      setJobs(result.ofertas || []);
      setResumen(result.resumen_mercado || "");
      setAllCompanies(result.ofertas?.map(o => o.empresa) || []);
      setFeedback({});
      setExpandedJob(null);
      setRound(r => r + 1);
      setPhase("results");
    } catch (e) {
      addLog("❌ Error: " + e.message);
      setPhase("idle");
    }
  }, []);

  const refinarBusqueda = useCallback(async () => {
    const liked = jobs.filter(j => feedback[j.id] === "like");
    const disliked = jobs.filter(j => feedback[j.id] === "dislike");
    if (!liked.length && !disliked.length) return;
    setPhase("loading");
    setAgentLog([]);
    addLog("🧠 Procesando feedback...");
    await new Promise(r => setTimeout(r, 200));
    addLog("🔍 Buscando nuevas ofertas ajustadas...");
    const pos = liked.map(j => `"${j.cargo}" en ${j.empresa} (${j.sector})`).join("; ");
    const neg = disliked.map(j => `"${j.cargo}" en ${j.empresa} (${j.sector})`).join("; ");
    try {
      const result = await runWithWebSearch(
        REFINE_PROMPT(pos, neg, allCompanies.join(", ")),
        "Busca nuevas ofertas reales ajustadas al feedback. Usa web_search."
      );
      addLog(`✅ ${result.ofertas?.length || 0} nuevas ofertas encontradas`);
      if (result.aprendizaje) addLog(`💡 ${result.aprendizaje}`);
      setJobs(result.ofertas || []);
      setResumen(result.resumen_mercado || "");
      setAprendizaje(result.aprendizaje || "");
      setAllCompanies(prev => [...prev, ...(result.ofertas?.map(o => o.empresa) || [])]);
      setFeedback({});
      setExpandedJob(null);
      setRound(r => r + 1);
      setPhase("results");
    } catch (e) {
      addLog("❌ Error: " + e.message);
      setPhase("idle");
    }
  }, [jobs, feedback, allCompanies]);

  const toggleFeedback = (id, type) => setFeedback(prev => ({ ...prev, [id]: prev[id] === type ? undefined : type }));
  const feedbackCount = Object.values(feedback).filter(Boolean).length;
  const sortedJobs = [...jobs].sort((a, b) => b.match_score - a.match_score);

  return (
    <div style={{ minHeight: "100vh", background: "#080810", color: "#dde1f0", fontFamily: "'DM Mono', 'Fira Code', monospace" }}>
      <div style={{ background: "#0c0c18", borderBottom: "1px solid #1a1a2e", padding: "20px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "11px", letterSpacing: "0.25em", color: "#6366f1", textTransform: "uppercase", marginBottom: "4px" }}>⬡ Agente de Búsqueda · Web Real</div>
          <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff", letterSpacing: "-0.02em" }}>Diego Elías · ICI Chile</div>
        </div>
        <div style={{ textAlign: "right", fontSize: "11px", color: "#4a4a6a", lineHeight: "1.6" }}>
          <div style={{ color: "#818cf8" }}>SQL · Power BI · Excel · Python</div>
          <div>LATAM · Cencosud · HP</div>
          {round > 0 && <div style={{ color: "#6366f1", marginTop: "4px" }}>Ronda {round}</div>}
        </div>
      </div>

      <div style={{ padding: "28px", maxWidth: "860px", margin: "0 auto" }}>
        {agentLog.length > 0 && (
          <div style={{ background: "#0c0c18", border: "1px solid #1a1a2e", borderRadius: "8px", padding: "14px 16px", marginBottom: "24px", fontSize: "11px" }}>
            {agentLog.map((log, i) => (
              <div key={i} style={{ display: "flex", gap: "12px", marginBottom: "4px", opacity: i === agentLog.length - 1 ? 1 : 0.5 }}>
                <span style={{ color: "#4a4a6a", flexShrink: 0 }}>{log.time}</span>
                <span style={{ color: i === agentLog.length - 1 ? "#a5b4fc" : "#6a6a8a" }}>{log.msg}</span>
              </div>
            ))}
            {phase === "loading" && (
              <div style={{ marginTop: "10px", display: "flex", gap: "4px" }}>
                {[0, 1, 2].map(i => <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#6366f1", animation: `pulse 1s ease-in-out ${i * 0.2}s infinite alternate` }} />)}
              </div>
            )}
          </div>
        )}

        {aprendizaje && phase === "results" && (
          <div style={{ background: "#0d1117", border: "1px solid #1e3a1e", borderRadius: "8px", padding: "12px 16px", marginBottom: "20px", fontSize: "12px", color: "#4ade80" }}>
            💡 {aprendizaje}
          </div>
        )}

        {phase === "idle" && (
          <div style={{ textAlign: "center", padding: "60px 20px", border: "1px dashed #1a1a2e", borderRadius: "12px" }}>
            <div style={{ fontSize: "40px", marginBottom: "16px" }}>⬡</div>
            <div style={{ fontSize: "16px", color: "#818cf8", marginBottom: "8px", fontWeight: "600" }}>Agente listo</div>
            <div style={{ fontSize: "12px", color: "#4a4a6a", marginBottom: "8px", lineHeight: "1.8" }}>
              Busca ofertas <strong style={{ color: "#6366f1" }}>reales</strong> con link directo a cada oferta<br />
              GetOnBoard · LinkedIn · Laborum · Trabajando.com · Computrabajo
            </div>
            <div style={{ fontSize: "11px", color: "#2a2a4a", marginBottom: "28px" }}>Puede tardar 30-60 seg — navega la web en tiempo real</div>
            <button onClick={buscarOfertas} style={{ background: "#6366f1", color: "#fff", border: "none", borderRadius: "8px", padding: "12px 28px", fontSize: "13px", fontFamily: "inherit", fontWeight: "600", cursor: "pointer" }}>
              Buscar ofertas reales →
            </button>
          </div>
        )}

        {resumen && phase === "results" && (
          <div style={{ fontSize: "12px", color: "#6a6a8a", marginBottom: "20px", padding: "10px 14px", borderLeft: "2px solid #6366f1" }}>
            {resumen}
          </div>
        )}

        {phase === "results" && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {sortedJobs.map((job) => {
                const mc = matchColor(job.match_score);
                const isExpanded = expandedJob === job.id;
                const fb = feedback[job.id];
                return (
                  <div key={job.id} style={{ background: "#0c0c18", border: `1px solid ${fb === "like" ? "#16a34a" : fb === "dislike" ? "#dc2626" : "#1a1a2e"}`, borderRadius: "10px", overflow: "hidden", transition: "border-color 0.2s" }}>
                    <div onClick={() => setExpandedJob(isExpanded ? null : job.id)} style={{ padding: "16px 18px", cursor: "pointer" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "14px", fontWeight: "700", color: "#e8e8f8", marginBottom: "3px" }}>{job.cargo}</div>
                          <div style={{ fontSize: "12px", color: "#818cf8", marginBottom: "8px" }}>
                            {job.empresa} · <span style={{ color: "#4a4a6a" }}>{job.sector}</span>
                          </div>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                            <span style={{ fontSize: "11px", color: modalidadColor(job.modalidad) }}>◆ {job.modalidad}</span>
                            <span style={{ fontSize: "11px", color: "#4a4a6a" }}>📍 {job.ubicacion}</span>
                            {job.fuente && <span style={{ fontSize: "11px", color: "#4a4a6a" }}>via {job.fuente}</span>}
                            {job.publicada && (
                              <span style={{ fontSize: "11px", color: publicadaColor(job.publicada), background: "#13131f", padding: "2px 7px", borderRadius: "4px" }}>
                                🕐 {job.publicada}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ background: mc.bg, border: `1px solid ${mc.border}`, borderRadius: "6px", padding: "4px 10px", fontSize: "13px", fontWeight: "700", color: mc.text, marginBottom: "4px" }}>{job.match_score}%</div>
                          <div style={{ fontSize: "10px", color: "#4a4a6a" }}>match</div>
                        </div>
                      </div>
                      <div style={{ marginTop: "10px", fontSize: "12px", color: "#facc15", fontWeight: "600" }}>💰 {job.rango_sueldo}</div>
                    </div>

                    {isExpanded && (
                      <div style={{ padding: "14px 18px 16px", borderTop: "1px solid #1a1a2e" }}>
                        <div style={{ fontSize: "12px", color: "#9090b0", lineHeight: "1.7", marginBottom: "12px" }}>{job.descripcion}</div>
                        <div style={{ marginBottom: "12px" }}>
                          <div style={{ fontSize: "10px", color: "#4a4a6a", letterSpacing: "0.1em", marginBottom: "6px" }}>REQUISITOS CLAVE</div>
                          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                            {job.requisitos_clave?.map((r, i) => (
                              <span key={i} style={{ fontSize: "10px", background: "#13131f", border: "1px solid #2a2a3e", borderRadius: "4px", padding: "3px 8px", color: "#9090b0" }}>{r}</span>
                            ))}
                          </div>
                        </div>
                        {job.match_herramientas?.length > 0 && (
                          <div style={{ marginBottom: "14px" }}>
                            <div style={{ fontSize: "10px", color: "#4a4a6a", letterSpacing: "0.1em", marginBottom: "6px" }}>TUS HERRAMIENTAS QUE PIDEN</div>
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                              {job.match_herramientas.map((h, i) => (
                                <span key={i} style={{ fontSize: "10px", background: "#0d1117", border: "1px solid #16a34a", borderRadius: "4px", padding: "3px 8px", color: "#4ade80" }}>✓ {h}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div style={{ paddingTop: "12px", borderTop: "1px solid #1a1a2e" }}>
                          {job.url && job.url.startsWith("http") ? (
                            <a href={job.url} target="_blank" rel="noopener noreferrer" style={{
                              display: "inline-flex", alignItems: "center", gap: "8px",
                              fontSize: "12px", background: "#13131f", border: "1px solid #6366f1",
                              borderRadius: "8px", padding: "10px 20px", color: "#818cf8",
                              textDecoration: "none", fontFamily: "inherit", fontWeight: "600",
                            }}>
                              🔗 Ver oferta en {job.fuente} ↗
                            </a>
                          ) : (
                            <span style={{ fontSize: "11px", color: "#4a4a6a" }}>URL no disponible</span>
                          )}
                        </div>
                      </div>
                    )}

                    <div style={{ padding: "10px 18px", borderTop: "1px solid #1a1a2e", display: "flex", gap: "8px", alignItems: "center" }}>
                      <span style={{ fontSize: "10px", color: "#4a4a6a", marginRight: "4px" }}>¿Te interesa?</span>
                      <button onClick={() => toggleFeedback(job.id, "like")} style={{ background: fb === "like" ? "#16a34a" : "transparent", border: `1px solid ${fb === "like" ? "#16a34a" : "#2a2a3e"}`, borderRadius: "6px", padding: "5px 14px", fontSize: "12px", color: fb === "like" ? "#fff" : "#4a4a6a", cursor: "pointer", fontFamily: "inherit" }}>👍 Sí</button>
                      <button onClick={() => toggleFeedback(job.id, "dislike")} style={{ background: fb === "dislike" ? "#7f1d1d" : "transparent", border: `1px solid ${fb === "dislike" ? "#dc2626" : "#2a2a3e"}`, borderRadius: "6px", padding: "5px 14px", fontSize: "12px", color: fb === "dislike" ? "#fca5a5" : "#4a4a6a", cursor: "pointer", fontFamily: "inherit" }}>👎 No</button>
                      <button onClick={() => setExpandedJob(isExpanded ? null : job.id)} style={{ background: "transparent", border: "1px solid #2a2a3e", borderRadius: "6px", padding: "5px 14px", fontSize: "12px", color: "#4a4a6a", cursor: "pointer", fontFamily: "inherit", marginLeft: "auto" }}>
                        {isExpanded ? "▲ Menos" : "▼ Ver detalle"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: "24px", display: "flex", gap: "12px", alignItems: "center", justifyContent: "space-between", padding: "16px", background: "#0c0c18", border: "1px solid #1a1a2e", borderRadius: "10px" }}>
              <div style={{ fontSize: "12px", color: "#4a4a6a" }}>
                {feedbackCount > 0 ? `${feedbackCount} oferta${feedbackCount > 1 ? "s" : ""} evaluada${feedbackCount > 1 ? "s" : ""} · el agente ajustará la búsqueda` : "Evalúa las ofertas para refinar la búsqueda"}
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={buscarOfertas} style={{ background: "transparent", border: "1px solid #2a2a3e", borderRadius: "8px", padding: "9px 18px", fontSize: "12px", color: "#6a6a8a", cursor: "pointer", fontFamily: "inherit" }}>Nueva búsqueda</button>
                <button onClick={refinarBusqueda} disabled={feedbackCount === 0} style={{ background: feedbackCount > 0 ? "#6366f1" : "#1a1a2e", border: "none", borderRadius: "8px", padding: "9px 18px", fontSize: "12px", color: feedbackCount > 0 ? "#fff" : "#4a4a6a", cursor: feedbackCount > 0 ? "pointer" : "default", fontFamily: "inherit", fontWeight: "600" }}>
                  Refinar con feedback →
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      <style>{`@keyframes pulse { from { opacity: 0.3; transform: scale(0.8); } to { opacity: 1; transform: scale(1.2); } }`}</style>
    </div>
  );
}
