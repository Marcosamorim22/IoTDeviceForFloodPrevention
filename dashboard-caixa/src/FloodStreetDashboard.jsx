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

function riskConfig(pct) {
  if (pct < 20) return { color: "#639922", label: "Seguro — via liberada",          alertBg: "#EAF3DE", alertBc: "#97C459" };
  if (pct < 40) return { color: "#EF9F27", label: "Atenção — trafegar devagar",     alertBg: "#FAEEDA", alertBc: "#FAC775" };
  if (pct < 65) return { color: "#D85A30", label: "Perigoso — não recomendado",     alertBg: "#FAECE7", alertBc: "#F09995" };
  return           { color: "#E24B4A", label: "CRÍTICO — rua intransitável",        alertBg: "#FCEBEB", alertBc: "#F7C1C1" };
}

function riskTextColor(pct) {
  if (pct < 20) return "#3B6D11";
  if (pct < 40) return "#BA7517";
  if (pct < 65) return "#993C1D";
  return "#A32D2D";
}

// ─── Subcomponentes ────────────────────────────────────────────────────────────

function AlertBar({ pct }) {
  if (pct === null || pct === undefined) return null;
  const rc = riskConfig(pct);
  const tc = riskTextColor(pct);
  return (
    <div
      style={{
        ...styles.alertBar,
        background: rc.alertBg,
        borderColor: rc.alertBc,
        color: tc,
      }}
    >
      <span style={{ fontSize: 18 }}>⚠️</span>
      <span style={{ fontWeight: 500 }}>{rc.label}</span>
    </div>
  );
}

function MetricCard({ icon, label, value, unit }) {
  return (
    <div style={styles.metricCard}>
      <div style={styles.metricLabel}>
        <span style={{ fontSize: 15 }}>{icon}</span> {label}
      </div>
      <div style={styles.metricValue}>
        {value ?? "—"}
        {value !== null && value !== undefined && unit && (
          <span style={styles.metricUnit}> {unit}</span>
        )}
      </div>
    </div>
  );
}

function GaugeArc({ pct }) {
  const radius = 62;
  const cx = 90;
  const cy = 90;
  const startAngle = 210;
  const totalAngle = 300;

  const rc = pct !== null ? riskConfig(pct) : null;
  const color = rc ? rc.color : "#D3D1C7";
  const textColor = pct !== null ? riskTextColor(pct) : "#888780";

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
    <svg
      viewBox="0 0 180 140"
      width="180"
      height="140"
      role="img"
      aria-label={`Gauge: ${pct ?? 0}%`}
    >
      <path
        d={describeArc(startAngle, startAngle + totalAngle, radius)}
        fill="none"
        stroke="#D3D1C7"
        strokeWidth="14"
        strokeLinecap="round"
      />
      {pct !== null && pct > 0 && (
        <path
          d={describeArc(startAngle, endAngle, radius)}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          style={{ transition: "all 0.6s ease" }}
        />
      )}
      <text
        x={cx}
        y={cy + 8}
        textAnchor="middle"
        fontSize="26"
        fontWeight="600"
        fill={color}
      >
        {pct !== null ? `${pct.toFixed(0)}%` : "—"}
      </text>
      <text x={cx} y={cy + 24} textAnchor="middle" fontSize="11" fill={textColor}>
        {pct !== null ? riskConfig(pct).label : "Aguardando..."}
      </text>
      <text x="18" y="130" fontSize="9" fill="#888780">0</text>
      <text x="147" y="130" fontSize="9" fill="#888780">100%</text>
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
        <div style={{ color: "#888780", fontStyle: "italic" }}>
          Nenhuma mensagem ainda...
        </div>
      )}
      {logs.map((l, i) => (
        <div
          key={i}
          style={{
            color: l.color,
            marginBottom: 2,
            fontSize: 11,
            fontFamily: "monospace",
          }}
        >
          [{l.time}] {l.msg}
        </div>
      ))}
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function FloodStreetDashboard() {
  const [connState, setConnState] = useState("disconnected"); 
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const clientRef = useRef(null);

  const addLog = useCallback((msg, type = "info") => {
    const colors = { info: "#888780", ok: "#3B6D11", err: "#A32D2D" };
    const time = new Date().toLocaleTimeString("pt-BR");
    setLogs((prev) =>
      [{ msg, time, color: colors[type] }, ...prev].slice(0, 60)
    );
  }, []);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.end(true);
      clientRef.current = null;
    }
    setConnState("disconnected");
  }, []);

  const connect = useCallback(() => {
    if (!mqtt) {
      addLog("Biblioteca mqtt.js não encontrada. npm install mqtt", "err");
      return;
    }

    const url = `wss://${DEFAULT_CONFIG.broker}:${DEFAULT_CONFIG.port}/mqtt`;
    setConnState("connecting");
    addLog(`Conectando a ${url} ...`);

    const client = mqtt.connect(url, {
      username: DEFAULT_CONFIG.user,
      password: DEFAULT_CONFIG.pass,
      clientId: "flood-dash-" + Math.random().toString(16).slice(2, 8),
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
        const pct   = parseFloat(d.porcentagem);
        const nivel = parseFloat(d.nivel_agua);
        const vel   = d.velocidade !== undefined ? parseFloat(d.velocidade) : null;
        const time  = new Date().toLocaleTimeString("pt-BR");

        setData({ pct, nivel, vel, time });
        setHistory((prev) => {
          const next = [...prev, { time, pct: parseFloat(pct.toFixed(1)) }];
          return next.slice(-MAX_HISTORY);
        });

        const velTxt = vel !== null ? ` | vel: ${vel.toFixed(1)} m/s` : "";
        addLog(`nível: ${nivel.toFixed(1)} cm | ${pct.toFixed(1)}%${velTxt}`);
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
  }, [addLog]);

  // Efeito para conectar automaticamente ao abrir a página
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

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

  const chartColor = data?.pct !== undefined ? riskConfig(data.pct).color : "#1D9E75";

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Monitor de enchente urbana</h1>
          <p style={styles.subtitle}>
            Nível de água em via pública · Monitoramento MQTT em tempo real
          </p>
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
          <span style={{ fontSize: 13, color: "#888780" }}>
            {statusLabels[connState]}
          </span>
        </div>
      </div>

      {/* Barra de alerta */}
      <AlertBar pct={data?.pct ?? null} />

      {/* Métricas */}
      <div style={styles.metricsGrid}>
        <MetricCard
          icon="📏"
          label="Nível"
          value={data ? data.nivel.toFixed(1) : null}
          unit="cm"
        />
        <MetricCard
          icon="💧"
          label="Porcentagem"
          value={data ? data.pct.toFixed(1) : null}
          unit="%"
        />
        <MetricCard
          icon="🌊"
          label="Velocidade"
          value={data?.vel !== null && data?.vel !== undefined ? data.vel.toFixed(1) : null}
          unit="cm/min"
        />
        <MetricCard
          icon="🕐"
          label="Última leitura"
          value={data?.time}
          unit=""
        />
      </div>

      {/* Gauge + Gráfico */}
      <div style={styles.vizRow}>
        <div
          style={{
            ...styles.card,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 200,
          }}
        >
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
              <LineChart
                data={history}
                margin={{ top: 4, right: 8, bottom: 0, left: -16 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(0,0,0,0.06)"
                />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10, fill: "#888780" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: "#888780" }}
                  tickFormatter={(v) => v + "%"}
                />
                <Tooltip
                  formatter={(v) => [`${v}%`, "Nível"]}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: "0.5px solid #D3D1C7",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="pct"
                  stroke={chartColor}
                  strokeWidth={2}
                  dot={{ r: 3, fill: chartColor }}
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

      {/* Legenda de risco */}
      <div style={styles.legend}>
        <div style={styles.legendTitle}>Legenda de risco</div>
        <div style={styles.legendGrid}>
          {[
            { range: "0 – 19%",  label: "Seguro",     color: "#639922", bg: "#EAF3DE" },
            { range: "20 – 39%", label: "Atenção",    color: "#BA7517", bg: "#FAEEDA" },
            { range: "40 – 64%", label: "Perigoso",   color: "#993C1D", bg: "#FAECE7" },
            { range: "≥ 65%",    label: "Crítico",    color: "#A32D2D", bg: "#FCEBEB" },
          ].map((r) => (
            <div
              key={r.range}
              style={{
                background: r.bg,
                borderRadius: 8,
                padding: "8px 12px",
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: r.color,
                  flexShrink: 0,
                }}
              />
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: r.color }}>
                  {r.label}
                </div>
                <div style={{ fontSize: 11, color: r.color }}>{r.range}</div>
              </div>
            </div>
          ))}
        </div>
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
  title:    { fontSize: 22, fontWeight: 600, margin: 0 },
  subtitle: { fontSize: 13, color: "#888780", margin: "4px 0 0" },
  alertBar: {
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 14,
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "0.5px solid",
    fontSize: 13,
  },
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
  metricUnit:  { fontSize: 13, color: "#888780", fontWeight: 400 },
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
  legend: {
    background: "#fff",
    border: "0.5px solid #D3D1C7",
    borderRadius: 12,
    padding: "16px 20px",
    marginBottom: 16,
  },
  legendTitle: {
    fontSize: 12,
    color: "#888780",
    fontWeight: 500,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  legendGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0,1fr))",
    gap: 10,
  },
};