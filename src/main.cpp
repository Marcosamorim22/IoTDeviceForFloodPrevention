#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <PubSubClient.h>

// ================= Configurações de Rede =================
const char* ssid = "MVT-AnaLaura";
const char* password = "98012704AL";

// ================= Configurações do HiveMQ Cloud =========
const char* mqtt_server = "329132687fb349a09107e68a8fd32f5c.s1.eu.hivemq.cloud";
const int mqtt_port = 8883;
const char* mqtt_user = "marcos";
const char* mqtt_pass = "mama3CIN";

// ================= Configurações dos Pinos ===============
const int trigPin = 12;
const int echoPin = 13;
const float ALTURA_TOTAL_CM = 200.0;

unsigned long tempoAnterior = 0;
const long intervalo = 2000;

// ================= Velocidade ============================
float nivelAnterior       = 0.0;
unsigned long tempoAnteriorVelocidade = 0;
float velocidade          = 0.0;          // cm/min
const long intervaloVelocidade = 5000;   // recalcula a cada 5s
bool primeiraLeitura      = true;

WiFiClientSecure espClient;
PubSubClient client(espClient);

// ===================== WiFi ==============================
void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Conectando na rede: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi conectado! IP: " + WiFi.localIP().toString());
}

// ===================== MQTT ==============================
void reconnect() {
  while (!client.connected()) {
    Serial.print("Tentando conexão MQTT...");
    String clientId = "ESP8266Client-" + String(random(0xffff), HEX);
    if (client.connect(clientId.c_str(), mqtt_user, mqtt_pass)) {
      Serial.println("Conectado!");
    } else {
      Serial.print("Falhou, rc=");
      Serial.print(client.state());
      Serial.println(" — tentando novamente em 5s.");
      delay(5000);
    }
  }
}

// ==================== Ultrassom ==========================
float lerDistanciaCM() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  long duracao = pulseIn(echoPin, HIGH, 30000);
  if (duracao == 0) return -1;
  return duracao * 0.034 / 2;
}

// ===================== Setup =============================
void setup() {
  Serial.begin(115200);
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  setup_wifi();
  espClient.setInsecure();
  client.setServer(mqtt_server, mqtt_port);
}

// ===================== Loop ==============================
void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  unsigned long tempoAtual = millis();
  if (tempoAtual - tempoAnterior >= intervalo) {
    tempoAnterior = tempoAtual;

    float distancia_cm = lerDistanciaCM();
    if (distancia_cm < 0) {
      Serial.println("Erro: leitura inválida do sensor.");
      return;
    }

    float nivel_agua = constrain(ALTURA_TOTAL_CM - distancia_cm, 0, ALTURA_TOTAL_CM);
    float porcentagem = (nivel_agua / ALTURA_TOTAL_CM) * 100.0;

    // ── Cálculo da velocidade ─────────────────────────────
    if (primeiraLeitura) {
      nivelAnterior             = nivel_agua;
      tempoAnteriorVelocidade   = tempoAtual;
      primeiraLeitura           = false;
    } else if (tempoAtual - tempoAnteriorVelocidade >= intervaloVelocidade) {
      float deltaMinutos = (tempoAtual - tempoAnteriorVelocidade) / 60000.0;
      velocidade                = (nivel_agua - nivelAnterior) / deltaMinutos;
      nivelAnterior             = nivel_agua;
      tempoAnteriorVelocidade   = tempoAtual;
    }
    // ─────────────────────────────────────────────────────

    String payload = "{";
    payload += "\"nivel_agua\": "  + String(nivel_agua, 2)  + ", ";
    payload += "\"porcentagem\": "  + String(porcentagem, 1) + ", ";
    payload += "\"velocidade\": "  + String(velocidade, 2)  + "}";

    if (client.publish("sensor/caixa/medicao", payload.c_str())) {
      Serial.println("Enviado: " + payload);
    } else {
      Serial.println("Falha ao publicar!");
    }
  }
}