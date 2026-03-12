import { useState, useCallback } from "react";

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `Eres un agente experto en búsqueda de empleo para profesionales chilenos.

El candidato es Diego Elías:
- Título: Ingeniero Civil Industrial (UAI), mención TI. Nivel Semi Senior.
- Experiencia: LATAM Airlines (Mejora Continua), Cencosud (Control de Gestión), HP (Trainee)
- Herramientas: Excel Avanzado, SQL Avanzado, Power BI, Python básico, Scrum
- Idiomas: Inglés avanzado. Ubicación: Santiago, Chile.

Cargos objetivo por PRIORIDAD:
1. ALTA: Project Manager, Jefe Proyectos, PMO, Mejora Continua, Lean, Excelencia Operacional
2. MEDIA: Business Analyst, Analista Funcional
3. BAJA: BI, Control de Gestión, Data Analyst

Preferencias: Retail > Tecnología > Logística > Banca > Consultoría > Minería.
Sueldo: $2.000.000 - $2.500.000 líquido. Empresas grandes o startups con estructura.

Genera 5 ofertas REALISTAS con empresas reales en Chile. Para search_keywords usa 3-4 palabras clave del cargo.

Responde SOLO con JSON válido sin texto ni backticks:
{
  "ofertas": [
    {
      "id": 1,
      "empresa": "nombre real",
      "sector": "sector",
      "cargo": "título del cargo",
      "ubicacion": "Santiago, Chile",
      "modalidad": "Presencial | Híbrido | Remoto",
      "rango_sueldo": "rango CLP líquido o No especificado",
      "descripcion": "2-3 líneas del rol",
      "requisitos_clave": ["req1", "req2", "req3"],
      "match_herramientas": ["herramientas de Diego que coinciden"],
      "search_keywords": "palabras clave para buscar esta oferta",
      "match_score": 75
    }
  ],
  "resumen_mercado": "Una línea sobre el mercado actual"
}`;

const REFINE_PROMPT = (fp, fn, eu) => `Agente búsqueda laboral Diego Elías, ICI semi senior Santiago.
Perfil: SQL, Excel, Power BI, Python, Inglés avanzado. LATAM, Cencosud.
Preferencias: PM > Business Analyst. Retail > Tech. Sueldo $2M-$2.5M.
LE GUSTARON: ${fp || "ninguno"}. NO GUSTARON: ${fn || "ninguno"}. NO repetir: ${eu}.
Genera 5 nuevas ofertas ajustadas. Mismo formato JSON con search_keywords y aprendizaje.`;

const buildLinks = (job) => {
  const kw = job.search_keywords || job.cargo;
  const q = encodeURIComponent(kw);
  const qPlus = kw.split(" ").join("+");
  const qDash = kw.split(" ").join("-").toLowerCase();
  return [
    { label: "LinkedIn", url: `https://www.linkedin.com/jobs/search/?keywords=${qPlus}&location=Chile&f_TPR=r604800` },
    { label: "GetOnBoard", url: `https://www.getonbrd.com/jobs?q=${q}` },
    { label: "Laborum", url: `https://www.laborum.cl/empleos?q=${q}&l=Santiago&posted=7` },
    { label: "Indeed", url: `https://cl.indeed.com/jobs?q=${q}&l=Santiago%2C+Chile&fromage=7` },
    { label: "Trabajando.com", url: `https://www.trabajando.cl/empleo/buscar/?q=${q}&ciudad=Santiago` },
    { label: "Computrabajo", url: `https://www.computrabajo.cl/empleos?q=${q}&l=Santiago` },
    { label: "Bumeran", url: `https://www.bumeran.cl/empleos-busqueda-${qDash}.html?pais=chile` },
  ];
};

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

const callClaude = async (system, userMsg) => {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  if (start === -1) throw new Error("No JSON en respuesta");
  let depth = 0, end = -1;
  for (let i = start; i < clean.length; i++) {
    if (clean[i] === "{") depth++;
    else if (clean[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error("JSON incompleto");
  return JSON.parse(clean.slice(start, end + 1));
};

export default function App() {
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
    await new Promise(r => setTimeout(r, 300));
    addLog("🧠 Analizando perfil y preferencias...");
    await new Promise(r => setTimeout(r, 400));
    addLog("🔍 Generando ofertas y links filtrados...");
    try {
      const result = await callClaude(SYSTEM_PROMPT, "Busca las mejores ofertas para el perfil de Diego.");
      addLog(`✅ ${result.ofertas?.length || 0} ofertas encontradas`);
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
    await new Promise(r => setTimeout(r, 400));
    addLog("🔍 Generando nuevas ofertas ajustadas...");
    const pos = liked.map(j => `"${j.cargo}" en ${j.empresa} (${j.sector})`).join("; ");
    const neg = disliked.map(j => `"${j.cargo}" en ${j.empresa} (${j.sector})`).join("; ");
    try {
      const result = await callClaude(
        REFINE_PROMPT(pos, neg, allCompanies.join(", ")),
        "Refina la búsqueda con el feedback."
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
          <div style={{ fontSize: "11px", letterSpacing: "0.25em", color: "#6366f1", textTransform: "uppercase", marginBottom: "4px" }}>⬡ Agente de Búsqueda Laboral</div>
          <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>Diego Elías · ICI Chile</div>
        </div>
        <div style={{ textAlign: "right", fontSize: "11px", color: "#4a4a6a", lineHeight: "1.6" }}>
          <div style={{ color: "#818cf8" }}>SQL · Power BI · Excel · Python</div>
          <div>LATAM · Cencosud · HP</div>
          {round > 0 && <div style={{ color: "#6366f1" }}>Ronda {round}</div>}
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
                {[0,1,2].map(i => <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#6366f1", animation: `pulse 1s ease-in-out ${i*0.2}s infinite alternate` }} />)}
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
            <div style={{ fontSize: "12px", color: "#4a4a6a", marginBottom: "28px", lineHeight: "1.8" }}>
              Ofertas rankeadas por match · Links a 7 portales filtrados por última semana
            </div>
            <button onClick={buscarOfertas} style={{ background: "#6366f1", color: "#fff", border: "none", borderRadius: "8px", padding: "12px 28px", fontSize: "13px", fontFamily: "inherit", fontWeight: "600", cursor: "pointer" }}>
              Buscar ofertas →
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
                const links = buildLinks(job);
                return (
                  <div key={job.id} style={{ background: "#0c0c18", border: `1px solid ${fb === "like" ? "#16a34a" : fb === "dislike" ? "#dc2626" : "#1a1a2e"}`, borderRadius: "10px", overflow: "hidden" }}>
                    <div onClick={() => setExpandedJob(isExpanded ? null : job.id)} style={{ padding: "16px 18px", cursor: "pointer" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "14px", fontWeight: "700", color: "#e8e8f8", marginBottom: "3px" }}>{job.cargo}</div>
                          <div style={{ fontSize: "12px", color: "#818cf8", marginBottom: "8px" }}>{job.empresa} · <span style={{ color: "#4a4a6a" }}>{job.sector}</span></div>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "11px", color: modalidadColor(job.modalidad) }}>◆ {job.modalidad}</span>
                            <span style={{ fontSize: "11px", color: "#4a4a6a" }}>📍 {job.ubicacion}</span>
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ background: mc.bg, border: `1px solid ${mc.border}`, borderRadius: "6px", padding: "4px 10px", fontSize: "13px", fontWeight: "700", color: mc.text }}>{job.match_score}%</div>
                          <div style={{ fontSize: "10px", color: "#4a4a6a", marginTop: "4px" }}>match</div>
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
                            {job.requisitos_clave?.map((r, i) => <span key={i} style={{ fontSize: "10px", background: "#13131f", border: "1px solid #2a2a3e", borderRadius: "4px", padding: "3px 8px", color: "#9090b0" }}>{r}</span>)}
                          </div>
                        </div>
                        {job.match_herramientas?.length > 0 && (
                          <div style={{ marginBottom: "14px" }}>
                            <div style={{ fontSize: "10px", color: "#4a4a6a", letterSpacing: "0.1em", marginBottom: "6px" }}>TUS HERRAMIENTAS QUE PIDEN</div>
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                              {job.match_herramientas.map((h, i) => <span key={i} style={{ fontSize: "10px", background: "#0d1117", border: "1px solid #16a34a", borderRadius: "4px", padding: "3px 8px", color: "#4ade80" }}>✓ {h}</span>)}
                            </div>
                          </div>
                        )}
                        <div style={{ paddingTop: "12px", borderTop: "1px solid #1a1a2e" }}>
                          <div style={{ fontSize: "10px", color: "#4a4a6a", letterSpacing: "0.1em", marginBottom: "10px" }}>BUSCAR EN PORTALES — última semana</div>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            {links.map(({ label, url }) => (
                              <a key={label} href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "11px", background: "#13131f", border: "1px solid #6366f1", borderRadius: "6px", padding: "6px 12px", color: "#818cf8", textDecoration: "none", fontFamily: "inherit" }}>
                                🔗 {label} ↗
                              </a>
                            ))}
                          </div>
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