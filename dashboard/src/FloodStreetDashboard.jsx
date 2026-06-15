import { useState, useEffect, useRef, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import mqtt from "mqtt";

// ─── Configuração ──────────────────────────────────────────────────────────────
const TOPIC = "sensor/rua/medicao";
const MAX_HISTORY = 40;

const MQTT_CONFIG = {
  broker: "329132687fb349a09107e68a8fd32f5c.s1.eu.hivemq.cloud",
  port:   "8884",
  user:   "marcos",
  pass:   "mama3CIN",
};

// ─── Limiares de risco (cm) ────────────────────────────────────────────────────
// Baseados em referências de defesa civil para vias urbanas
const LIMIARES = {
  seguro:    10,   // 0–10 cm   → tudo liberado
  atencao:   30,   // 11–30 cm  → pedestres com cuidado
  perigoso:  60,   // 31–60 cm  → pedestres proibidos, veículos com cuidado
  critico:   80,   // >60 cm    → tudo proibido
};

// ─── Helpers de risco ──────────────────────────────────────────────────────────
function getRisco(cm) {
  if (cm <= LIMIARES.seguro)   return { nivel: 0, label: "Seguro",   cor: "#3B6D11", bg: "#EAF3DE", borda: "#97C459" };
  if (cm <= LIMIARES.atencao)  return { nivel: 1, label: "Atenção",  cor: "#854F0B", bg: "#FAEEDA", borda: "#FAC775" };
  if (cm <= LIMIARES.perigoso) return { nivel: 2, label: "Perigoso", cor: "#A32D2D", bg: "#FCEBEB", borda: "#F09595" };
  return                              { nivel: 3, label: "Crítico",  cor: "#F09595", bg: "#4A1B0C", borda: "#791F1F" };
}

function getStatusPedestre(cm) {
  if (cm <= LIMIARES.seguro)   return { status: "Liberado",  desc: "Passagem segura.",              cor: "#3B6D11", bg: "#EAF3DE", borda: "#97C459" };
  if (cm <= 30)                return { status: "Cuidado",   desc: "Água nos pés. Atenção.",        cor: "#854F0B", bg: "#FAEEDA", borda: "#FAC775" };
  if (cm <= 50)                return { status: "Perigoso",  desc: "Risco de queda e correnteza.", cor: "#A32D2D", bg: "#FCEBEB", borda: "#F09595" };
  return                              { status: "Proibido",  desc: "Perigo de vida.",               cor: "#F09595", bg: "#4A1B0C", borda: "#791F1F" };
}

function getStatusVeiculo(cm) {
  if (cm <= 20)                return { status: "Liberado",  desc: "Trânsito normal.",              cor: "#3B6D11", bg: "#EAF3DE", borda: "#97C459" };
  if (cm <= 40)                return { status: "Cuidado",   desc: "Devagar. Risco de pane.",       cor: "#854F0B", bg: "#FAEEDA", borda: "#FAC775" };
  if (cm <= 70)                return { status: "Perigoso",  desc: "Risco de arrastamento.",        cor: "#A32D2D", bg: "#FCEBEB", borda: "#F09595" };
  return                              { status: "Proibido",  desc: "Via bloqueada.",                cor: "#F09595", bg: "#4A1B0C", borda: "#791F1F" };
}

function getTendencia(vel) {
  if (vel > 1)  return { label: "Subindo ↑",  cor: "#A32D2D" };
  if (vel < -1) return { label: "Descendo ↓", cor: "#3B6D11" };
  return               { label: "Estável →",  cor: "#888780" };
}

// ─── Componentes ───────────────────────────────────────────────────────────────
function MetricCard({ label, value, unit, cor }) {
  return (
    <div style={S.metricCard}>
      <div style={S.metricLabel}>{label}</div>
      <div style={{ ...S.metricValue, color: cor ?? "#1a1a1a" }}>
        {value ?? "—"}
        {value != null && unit && <span style={S.metricUnit}> {unit}</span>}
      </div>
    </div>
  );
}

function PassagemCard({ icone, tipo, status, desc, cor, bg, borda }) {
  return (
    <div style={{ ...S.passagemCard, background: bg, borderColor: borda }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: cor, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
        {icone} {tipo}
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, color: cor }}>{status ?? "—"}</div>
      <div style={{ fontSize: 11, color: cor, marginTop: 3 }}>{desc ?? "Aguardando dados"}</div>
    </div>
  );
}

function GaugeArc({ cm, maxCm = 120 }) {
  const pct = cm !== null ? Math.min(cm / maxCm, 1) : null;
  const R = 62, cx = 90, cy = 88;
  const startAngle = 210, totalAngle = 300;
  const risco = cm !== null ? getRisco(cm) : null;
  const cor = risco ? risco.cor : "#D3D1C7";

  function p2xy(deg, r) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }
  function arc(s, e, r) {
    const a = p2xy(s, r), b = p2xy(e, r);
    return `M ${a.x} ${a.y} A ${r} ${r} 0 ${e - s > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
  }

  const endAngle = startAngle + (pct !== null ? pct * totalAngle : 0);

  // Marcadores de limiar
  const markers = [
    { cm: LIMIARES.seguro,   cor: "#97C459" },
    { cm: LIMIARES.atencao,  cor: "#FAC775" },
    { cm: LIMIARES.perigoso, cor: "#F09595" },
  ];

  return (
    <svg viewBox="0 0 180 130" width="190" height="130" role="img" aria-label={`Nível de água: ${cm ?? 0} cm`}>
      <path d={arc(startAngle, startAngle + totalAngle, R)} fill="none" stroke="#E8E6DF" strokeWidth="13" strokeLinecap="round" />
      {pct !== null && pct > 0 && (
        <path d={arc(startAngle, endAngle, R)} fill="none" stroke={cor} strokeWidth="13" strokeLinecap="round" style={{ transition: "all 0.5s ease" }} />
      )}
      {markers.map((m) => {
        const a = startAngle + (m.cm / maxCm) * totalAngle;
        const inner = p2xy(a, R - 10);
        const outer = p2xy(a, R + 4);
        return <line key={m.cm} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={m.cor} strokeWidth="2" />;
      })}
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize="26" fontWeight="600" fill={cor} style={{ transition: "fill 0.5s" }}>
        {cm !== null ? `${cm.toFixed(1)}` : "—"}
      </text>
      <text x={cx} y={cy + 20} textAnchor="middle" fontSize="10" fill="#888780">cm</text>
      <text x={cx} y={cy + 34} textAnchor="middle" fontSize="11" fill={risco?.cor ?? "#888780"}>
        {risco?.label ?? "Aguardando..."}
      </text>
      <text x="16" y="122" fontSize="9" fill="#B4B2A9">0</text>
      <text x="148" y="122" fontSize="9" fill="#B4B2A9">{maxCm} cm</text>
    </svg>
  );
}

function LogBox({ logs }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = 0; }, [logs]);
  return (
    <div ref={ref} style={S.logBox}>
      {logs.length === 0
        ? <span style={{ fontStyle: "italic" }}>Nenhuma mensagem ainda...</span>
        : logs.map((l, i) => (
            <div key={i} style={{ color: l.cor, marginBottom: 2 }}>
              [{l.time}] {l.msg}
            </div>
          ))}
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function FloodStreetDashboard() {
  const [connState, setConnState] = useState("disconnected");
  const [data,      setData]      = useState(null);   // { cm, vel, time }
  const [history,   setHistory]   = useState([]);     // [{ time, cm }]
  const [picoMax,   setPicoMax]   = useState(null);
  const [logs,      setLogs]      = useState([]);
  const clientRef = useRef(null);

  const addLog = useCallback((msg, tipo = "info") => {
    const cores = { info: "#888780", ok: "#3B6D11", err: "#A32D2D" };
    const time  = new Date().toLocaleTimeString("pt-BR");
    setLogs((prev) => [{ msg, time, cor: cores[tipo] }, ...prev].slice(0, 60));
  }, []);

  const disconnect = useCallback(() => {
    clientRef.current?.end(true);
    clientRef.current = null;
    setConnState("disconnected");
  }, []);

  const connect = useCallback(() => {
    const url = `wss://${MQTT_CONFIG.broker}:${MQTT_CONFIG.port}/mqtt`;
    setConnState("connecting");
    addLog(`Conectando a ${url}...`);

    const client = mqtt.connect(url, {
      username:          MQTT_CONFIG.user,
      password:          MQTT_CONFIG.pass,
      clientId:          "rua-dash-" + Math.random().toString(16).slice(2, 8),
      rejectUnauthorized: false,
    });

    client.on("connect", () => {
      setConnState("connected");
      addLog("Conexão estabelecida!", "ok");
      client.subscribe(TOPIC, (err) => {
        if (!err) addLog(`Inscrito em ${TOPIC}`, "ok");
        else      addLog("Falha ao subscrever: " + err.message, "err");
      });
    });

    client.on("message", (_topic, payload) => {
      try {
        const d   = JSON.parse(payload.toString());
        const cm  = parseFloat(d.nivel_agua);
        const vel = d.velocidade !== undefined ? parseFloat(d.velocidade) : 0;
        const time = new Date().toLocaleTimeString("pt-BR");

        setData({ cm, vel, time });
        setPicoMax((prev) => (prev === null || cm > prev ? cm : prev));
        setHistory((prev) => [...prev, { time, cm: parseFloat(cm.toFixed(1)) }].slice(-MAX_HISTORY));

        const tend = getTendencia(vel);
        addLog(`nível: ${cm.toFixed(1)} cm | vel: ${vel.toFixed(1)} cm/min | ${tend.label}`);
      } catch {
        addLog("Payload inválido: " + payload.toString(), "err");
      }
    });

    client.on("error", (err) => { setConnState("error"); addLog("Erro: " + err.message, "err"); });
    client.on("close", ()    => { setConnState("disconnected"); addLog("Conexão encerrada."); });
    clientRef.current = client;
  }, [addLog]);

  useEffect(() => { connect(); return () => disconnect(); }, [connect, disconnect]);

  const risco     = data ? getRisco(data.cm)            : null;
  const pedestre  = data ? getStatusPedestre(data.cm)   : null;
  const veiculo   = data ? getStatusVeiculo(data.cm)    : null;
  const tendencia = data ? getTendencia(data.vel)       : null;

  const statusCores  = { disconnected: "#B4B2A9", connecting: "#EF9F27", connected: "#1D9E75", error: "#E24B4A" };
  const statusLabels = { disconnected: "Desconectado", connecting: "Conectando...", connected: "Conectado", error: "Erro" };

  // Cor dinâmica da linha do gráfico
  const chartCor = risco ? risco.cor : "#378ADD";

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <h1 style={S.title}>Monitor de alagamento urbano</h1>
          <p style={S.subtitle}>Nível de água em via pública · MQTT em tempo real</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: statusCores[connState], display: "inline-block", transition: "background 0.3s" }} />
          <span style={{ fontSize: 12, color: "#888780" }}>{statusLabels[connState]}</span>
        </div>
      </div>

      {/* Banner de alerta */}
      {risco && (
        <div style={{ ...S.alertBanner, background: risco.bg, borderColor: risco.borda, color: risco.cor }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{risco.label}</span>
          <span style={{ fontSize: 13 }}>— {data.cm.toFixed(1)} cm registrados agora</span>
        </div>
      )}

      {/* Status de passagem */}
      <div style={S.passagemGrid}>
        <PassagemCard icone="🚶" tipo="Pedestre" {...(pedestre ?? {})} />
        <PassagemCard icone="🚗" tipo="Veículo"  {...(veiculo  ?? {})} />
      </div>

      {/* Métricas */}
      <div style={S.metricsGrid}>
        <MetricCard label="Nível atual"    value={data ? data.cm.toFixed(1) : null}           unit="cm"     cor={risco?.cor} />
        <MetricCard label="Velocidade"     value={data ? data.vel.toFixed(1) : null}           unit="cm/min" cor={tendencia?.cor} />
        <MetricCard label="Tendência"      value={tendencia?.label ?? null}                    unit=""       cor={tendencia?.cor} />
        <MetricCard label="Pico da sessão" value={picoMax !== null ? picoMax.toFixed(1) : null} unit="cm"   cor="#A32D2D" />
        <MetricCard label="Última leitura" value={data?.time ?? null}                          unit="" />
      </div>

      {/* Gauge + Gráfico */}
      <div style={S.vizRow}>
        <div style={{ ...S.card, margin: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 210 }}>
          <div style={S.cardTitle}>Nível atual</div>
          <GaugeArc cm={data?.cm ?? null} />
        </div>

        <div style={{ ...S.card, margin: 0, flex: 1 }}>
          <div style={S.cardTitle}>Histórico — nível (cm)</div>
          {history.length === 0 ? (
            <div style={{ color: "#888780", fontSize: 13, paddingTop: 16 }}>Aguardando dados do sensor...</div>
          ) : (
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={history} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#888780" }} interval="preserveStartEnd" />
                <YAxis domain={[0, 120]} tick={{ fontSize: 10, fill: "#888780" }} tickFormatter={(v) => v + "cm"} />
                {/* Linhas de referência de risco */}
                <ReferenceLine y={LIMIARES.seguro}   stroke="#97C459" strokeDasharray="4 3" label={{ value: "10cm", fontSize: 9, fill: "#97C459" }} />
                <ReferenceLine y={LIMIARES.atencao}  stroke="#FAC775" strokeDasharray="4 3" label={{ value: "30cm", fontSize: 9, fill: "#FAC775" }} />
                <ReferenceLine y={LIMIARES.perigoso} stroke="#F09595" strokeDasharray="4 3" label={{ value: "60cm", fontSize: 9, fill: "#F09595" }} />
                <Tooltip
                  formatter={(v) => [`${v} cm`, "Nível"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "0.5px solid #D3D1C7" }}
                />
                <Line
                  type="monotone" dataKey="cm"
                  stroke={chartCor} strokeWidth={2}
                  dot={{ r: 3, fill: chartCor }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Log */}
      <div style={S.card}>
        <div style={S.cardTitle}>Log MQTT</div>
        <LogBox logs={logs} />
      </div>

      {/* Legenda de limiares */}
      <div style={S.card}>
        <div style={S.cardTitle}>Referência de risco — vias urbanas</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 10 }}>
          {[
            { range: "0 – 10 cm",  label: "Seguro",   cor: "#3B6D11", bg: "#EAF3DE", borda: "#97C459",  ped: "Livre",    vei: "Livre" },
            { range: "11 – 30 cm", label: "Atenção",  cor: "#854F0B", bg: "#FAEEDA", borda: "#FAC775",  ped: "Cuidado",  vei: "Livre" },
            { range: "31 – 60 cm", label: "Perigoso", cor: "#A32D2D", bg: "#FCEBEB", borda: "#F09595",  ped: "Proibido", vei: "Cuidado" },
            { range: "> 60 cm",    label: "Crítico",  cor: "#F09595", bg: "#4A1B0C", borda: "#791F1F",  ped: "Proibido", vei: "Proibido" },
          ].map((r) => (
            <div key={r.range} style={{ background: r.bg, borderRadius: 8, padding: "10px 12px", border: `0.5px solid ${r.borda}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: r.cor, marginBottom: 2 }}>{r.label}</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: r.cor }}>{r.range}</div>
              <div style={{ fontSize: 10, color: r.cor, marginTop: 6 }}>🚶 {r.ped}</div>
              <div style={{ fontSize: 10, color: r.cor }}>🚗 {r.vei}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Estilos ───────────────────────────────────────────────────────────────────
const S = {
  root: { fontFamily: "'Inter', system-ui, sans-serif", maxWidth: 880, margin: "0 auto", padding: "24px 16px", color: "#1a1a1a" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title:  { fontSize: 22, fontWeight: 600, margin: 0 },
  subtitle: { fontSize: 13, color: "#888780", margin: "4px 0 0" },
  alertBanner: { borderRadius: 10, padding: "10px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, border: "0.5px solid", transition: "all 0.4s" },
  passagemGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 },
  passagemCard: { borderRadius: 10, padding: "12px 16px", border: "0.5px solid", transition: "all 0.4s" },
  metricsGrid: { display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 10, marginBottom: 16 },
  metricCard: { background: "#F1EFE8", borderRadius: 8, padding: "12px 14px" },
  metricLabel: { fontSize: 11, color: "#888780", marginBottom: 5 },
  metricValue: { fontSize: 18, fontWeight: 600 },
  metricUnit:  { fontSize: 12, color: "#888780", fontWeight: 400 },
  vizRow: { display: "flex", gap: 14, marginBottom: 14, alignItems: "stretch" },
  card: { background: "#fff", border: "0.5px solid #D3D1C7", borderRadius: 12, padding: "16px 20px", marginBottom: 14 },
  cardTitle: { fontSize: 11, color: "#888780", fontWeight: 500, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" },
  logBox: { fontFamily: "monospace", fontSize: 11, background: "#F1EFE8", borderRadius: 8, padding: 10, maxHeight: 100, overflowY: "auto", color: "#888780" },
};
