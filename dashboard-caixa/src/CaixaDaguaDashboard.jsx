import { useState, useEffect, useRef, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import mqtt from "mqtt";

// ─── Constantes ────────────────────────────────────────────────────────────────
const TOPIC = "sensor/caixa/medicao";
const MAX_HISTORY = 30;

const DEFAULT_CONFIG = {
  broker: "329132687fb349a09107e68a8fd32f5c.s1.eu.hivemq.cloud",
  port: "8884",
  user: "marcos",
  pass: "mama3CIN",
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
function levelColor(pct) {
  if (pct < 20) return "#E24B4A";
  if (pct < 50) return "#EF9F27";
  return "#1D9E75";
}

function levelLabel(pct) {
  if (pct < 20) return "Nível crítico";
  if (pct < 50) return "Nível baixo";
  if (pct < 80) return "Nível normal";
  return "Caixa cheia";
}

// ─── Subcomponentes ────────────────────────────────────────────────────────────

function MetricCard({ icon, label, value, unit }) {
  return (
    <div style={styles.metricCard}>
      <div style={styles.metricLabel}>
        <span style={{ fontSize: 15 }}>{icon}</span> {label}
      </div>
      <div style={styles.metricValue}>
        {value ?? "—"}
        {value !== null && value !== undefined && (
          <span style={styles.metricUnit}> {unit}</span>
        )}
      </div>
    </div>
  );
}

function GaugeArc({ pct }) {
  const radius = 60;
  const cx = 80;
  const cy = 80;
  const startAngle = 210;
  const totalAngle = 300;
  const color = pct !== null ? levelColor(pct) : "#D3D1C7";

  function polarToXY(angleDeg, r) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function describeArc(startDeg, endDeg, r) {
    const s = polarToXY(startDeg, r);
    const e = polarToXY(endDeg, r);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  const endAngle = startAngle + (pct !== null ? (pct / 100) * totalAngle : 0);

  return (
    <svg viewBox="0 0 160 120" width="160" height="120" role="img" aria-label={`Gauge: ${pct ?? 0}%`}>
      <path
        d={describeArc(startAngle, startAngle + totalAngle, radius)}
        fill="none"
        stroke="#E8E6DF"
        strokeWidth="12"
        strokeLinecap="round"
      />
      {pct !== null && pct > 0 && (
        <path
          d={describeArc(startAngle, endAngle, radius)}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          style={{ transition: "all 0.6s ease" }}
        />
      )}
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize="22" fontWeight="500" fill={color}>
        {pct !== null ? `${pct.toFixed(0)}%` : "—"}
      </text>
      <text x={cx} y={cy + 26} textAnchor="middle" fontSize="11" fill="#888780">
        {pct !== null ? levelLabel(pct) : "Aguardando..."}
      </text>
    </svg>
  );
}

function LogBox({ logs }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [logs]);

  return (
    <div ref={ref} style={styles.logBox}>
      {logs.length === 0 && (
        <div style={{ color: "#888780", fontStyle: "italic" }}>Nenhuma mensagem ainda...</div>
      )}
      {logs.map((l, i) => (
        <div key={i} style={{ color: l.color, marginBottom: 2, fontSize: 11, fontFamily: "monospace" }}>
          [{l.time}] {l.msg}
        </div>
      ))}
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function CaixaDaguaDashboard() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [connState, setConnState] = useState("disconnected"); // disconnected | connecting | connected | error
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const clientRef = useRef(null);

  const addLog = useCallback((msg, type = "info") => {
    const colors = { info: "#888780", ok: "#3B6D11", err: "#A32D2D" };
    const time = new Date().toLocaleTimeString("pt-BR");
    setLogs((prev) => [{ msg, time, color: colors[type] }, ...prev].slice(0, 60));
  }, []);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.end(true);
      clientRef.current = null;
    }
    setConnState("disconnected");
  }, []);

  const connect = useCallback(() => {
    // Requer mqtt.js via CDN ou instalado: npm install mqtt
    
    if (!mqtt) {
      addLog("Biblioteca mqtt.js não encontrada. Adicione: npm install mqtt", "err");
      return;
    }

    const url = `wss://${config.broker}:${config.port}/mqtt`;
    setConnState("connecting");
    addLog(`Conectando a ${url} ...`);

    const client = mqtt.connect(url, {
      username: config.user,
      password: config.pass,
      clientId: "dashboard-" + Math.random().toString(16).slice(2, 8),
      rejectUnauthorized: false,
    });

    client.on("connect", () => {
      setConnState("connected");
      addLog("Conexão estabelecida!", "ok");
      client.subscribe(TOPIC, (err) => {
        if (!err) addLog(`Inscrito em ${TOPIC}`, "ok");
        else addLog("Falha ao subscrever: " + err.message, "err");
      });
    });

    client.on("message", (_topic, payload) => {
      try {
        const d = JSON.parse(payload.toString());
        const pct = parseFloat(d.porcentagem);
        const nivel = parseFloat(d.nivel_agua);
        const volume = parseFloat(d.volume);
        const time = new Date().toLocaleTimeString("pt-BR");

        setData({ pct, nivel, volume, time });
        setHistory((prev) => {
          const next = [...prev, { time, pct: parseFloat(pct.toFixed(1)) }];
          return next.slice(-MAX_HISTORY);
        });
        addLog(`nível: ${nivel.toFixed(1)}cm | ${pct.toFixed(1)}% | ${volume.toFixed(0)}L`);
      } catch {
        addLog("Payload inválido: " + payload.toString(), "err");
      }
    });

    client.on("error", (err) => {
      setConnState("error");
      addLog("Erro: " + err.message, "err");
    });

    client.on("close", () => {
      setConnState("disconnected");
      addLog("Conexão encerrada.");
    });

    clientRef.current = client;
  }, [config, addLog]);

  const toggleConnect = () => {
    if (connState === "connected") disconnect();
    else connect();
  };

  useEffect(() => () => disconnect(), [disconnect]);

  const statusColors = {
    disconnected: "#B4B2A9",
    connecting: "#EF9F27",
    connected: "#1D9E75",
    error: "#E24B4A",
  };
  const statusLabels = {
    disconnected: "Desconectado",
    connecting: "Conectando...",
    connected: "Conectado",
    error: "Erro de conexão",
  };

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>💧 Caixa d'Água</h1>
          <p style={styles.subtitle}>Monitoramento em tempo real via MQTT</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: statusColors[connState],
              display: "inline-block",
              transition: "background 0.3s",
            }}
          />
          <span style={{ fontSize: 13, color: "#888780" }}>{statusLabels[connState]}</span>
        </div>
      </div>

      {/* Conexão */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>Configuração MQTT</div>
        <div style={styles.formGrid}>
          {[
            { label: "Broker (host)", key: "broker", type: "text" },
            { label: "Porta WSS", key: "port", type: "number" },
            { label: "Usuário", key: "user", type: "text" },
            { label: "Senha", key: "pass", type: "password" },
          ].map(({ label, key, type }) => (
            <div key={key}>
              <div style={styles.formLabel}>{label}</div>
              <input
                type={type}
                value={config[key]}
                disabled={connState === "connected" || connState === "connecting"}
                onChange={(e) => setConfig((c) => ({ ...c, [key]: e.target.value }))}
                style={styles.input}
              />
            </div>
          ))}
        </div>
        <button
          onClick={toggleConnect}
          disabled={connState === "connecting"}
          style={{
            ...styles.btn,
            background: connState === "connected" ? "#FCEBEB" : "#EAF3DE",
            color: connState === "connected" ? "#A32D2D" : "#3B6D11",
            borderColor: connState === "connected" ? "#F09595" : "#97C459",
          }}
        >
          {connState === "connecting" ? "Conectando..." : connState === "connected" ? "Desconectar" : "Conectar"}
        </button>
      </div>

      {/* Métricas */}
      <div style={styles.metricsGrid}>
        <MetricCard icon="📏" label="Nível" value={data ? data.nivel.toFixed(1) : null} unit="cm" />
        <MetricCard icon="📊" label="Porcentagem" value={data ? data.pct.toFixed(1) : null} unit="%" />
        <MetricCard icon="🪣" label="Volume" value={data ? data.volume.toFixed(0) : null} unit="L" />
        <MetricCard icon="🕐" label="Última leitura" value={data?.time} unit="" />
      </div>

      {/* Gauge + Gráfico */}
      <div style={styles.vizRow}>
        <div style={{ ...styles.card, margin: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 180 }}>
          <div style={styles.cardTitle}>Nível atual</div>
          <GaugeArc pct={data?.pct ?? null} />
        </div>

        <div style={{ ...styles.card, margin: 0, flex: 1 }}>
          <div style={styles.cardTitle}>Histórico — nível (%)</div>
          {history.length === 0 ? (
            <div style={{ color: "#888780", fontSize: 13, paddingTop: 16 }}>
              Aguardando dados do sensor...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={history} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#888780" }} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#888780" }} tickFormatter={(v) => v + "%"} />
                <Tooltip
                  formatter={(v) => [`${v}%`, "Nível"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "0.5px solid #D3D1C7" }}
                />
                <Line
                  type="monotone"
                  dataKey="pct"
                  stroke="#1D9E75"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#1D9E75" }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Log */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>Log MQTT</div>
        <LogBox logs={logs} />
      </div>

      {/* Aviso mqtt.js */}
      <div style={styles.notice}>
        ⚙️ Instale a dependência: <code style={styles.code}>npm install mqtt recharts</code> — e importe{" "}
        <code style={styles.code}>mqtt</code> conforme o bundler do seu projeto (ex:{" "}
        <code style={styles.code}>import mqtt from "mqtt"</code>) e passe como <code style={styles.code}>window.mqtt</code> ou ajuste o hook.
      </div>
    </div>
  );
}

// ─── Estilos ───────────────────────────────────────────────────────────────────
const styles = {
  root: {
    fontFamily: "'Inter', system-ui, sans-serif",
    maxWidth: 860,
    margin: "0 auto",
    padding: "24px 16px",
    color: "#1a1a1a",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: 600, margin: 0 },
  subtitle: { fontSize: 13, color: "#888780", margin: "4px 0 0" },
  card: {
    background: "#fff",
    border: "0.5px solid #D3D1C7",
    borderRadius: 12,
    padding: "16px 20px",
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 12,
    color: "#888780",
    fontWeight: 500,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginBottom: 14,
  },
  formLabel: { fontSize: 12, color: "#888780", marginBottom: 4 },
  input: {
    width: "100%",
    padding: "7px 10px",
    fontSize: 13,
    border: "0.5px solid #D3D1C7",
    borderRadius: 8,
    outline: "none",
    background: "#fff",
    color: "#1a1a1a",
    boxSizing: "border-box",
  },
  btn: {
    padding: "8px 20px",
    fontSize: 13,
    fontWeight: 500,
    border: "0.5px solid",
    borderRadius: 8,
    cursor: "pointer",
    transition: "opacity 0.2s",
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0,1fr))",
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    background: "#F1EFE8",
    borderRadius: 8,
    padding: "14px 16px",
  },
  metricLabel: {
    fontSize: 12,
    color: "#888780",
    marginBottom: 6,
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  metricValue: { fontSize: 22, fontWeight: 600, color: "#1a1a1a" },
  metricUnit: { fontSize: 13, color: "#888780", fontWeight: 400 },
  vizRow: {
    display: "flex",
    gap: 16,
    marginBottom: 16,
    alignItems: "stretch",
  },
  logBox: {
    fontFamily: "monospace",
    fontSize: 11,
    background: "#F1EFE8",
    borderRadius: 8,
    padding: 10,
    maxHeight: 100,
    overflowY: "auto",
    color: "#888780",
  },
  notice: {
    fontSize: 12,
    color: "#888780",
    background: "#F1EFE8",
    borderRadius: 8,
    padding: "10px 14px",
    lineHeight: 1.6,
  },
  code: {
    background: "#E8E6DF",
    borderRadius: 4,
    padding: "1px 5px",
    fontFamily: "monospace",
    fontSize: 11,
    color: "#3B6D11",
  },
};
