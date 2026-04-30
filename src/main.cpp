#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <PubSubClient.h>

// ================= Configurações de Rede e MQTT =================
const char* ssid = "NOME_DO_SEU_WIFI";
const char* password = "SENHA_DO_SEU_WIFI";

const char* mqtt_server = "IP_DO_SEU_BROKER_MQTT"; 
const int mqtt_port = 1883;

// ================= Configurações dos Pinos ======================
// No PlatformIO para NodeMCU, os pinos D1 e D2 já são reconhecidos por padrão,
// mas se der erro, você pode usar os GPIOs originais: D1 = 5, D2 = 4
const int trigPin = D1; 
const int echoPin = D2; 

// ================= Variáveis do Sistema =========================
const float ALTURA_TOTAL_CM = 150.0; // Distância do sensor até o fundo
unsigned long tempoAnterior = 0;
const long intervalo = 2000; // 2 segundos

WiFiClient espClient;
PubSubClient client(espClient);

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

  Serial.println("");
  Serial.println("WiFi conectado!");
  Serial.print("Endereço IP: ");
  Serial.println(WiFi.localIP());
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Tentando conexão MQTT...");
    String clientId = "ESP8266Client-NivelAgua";
    
    if (client.connect(clientId.c_str())) {
      Serial.println("Conectado!");
    } else {
      Serial.print("Falhou, rc=");
      Serial.print(client.state());
      Serial.println(" Tentando de novo em 5s.");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);

  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  unsigned long tempoAtual = millis();
  
  if (tempoAtual - tempoAnterior >= intervalo) {
    tempoAnterior = tempoAtual;

    // --- LEITURA DO SENSOR ---
    digitalWrite(trigPin, LOW);
    delayMicroseconds(2);
    digitalWrite(trigPin, HIGH);
    delayMicroseconds(10);
    digitalWrite(trigPin, LOW);

    long duracao = pulseIn(echoPin, HIGH);
    float distancia_vazia_cm = duracao * 0.034 / 2;

    // --- LÓGICA ---
    float nivel_agua_cm = ALTURA_TOTAL_CM - distancia_vazia_cm;

    if (nivel_agua_cm < 0) nivel_agua_cm = 0; 
    if (nivel_agua_cm > ALTURA_TOTAL_CM) nivel_agua_cm = ALTURA_TOTAL_CM; 

    float porcentagem = (nivel_agua_cm / ALTURA_TOTAL_CM) * 100.0;

    // --- JSON ---
    String payload = "{";
    payload += "\"distancia_vazia_cm\": " + String(distancia_vazia_cm) + ", ";
    payload += "\"nivel_agua_cm\": " + String(nivel_agua_cm) + ", ";
    payload += "\"porcentagem\": " + String(porcentagem) + "";
    payload += "}";

    Serial.print("Publicando: ");
    Serial.println(payload);

    client.publish("caixa/nivel", payload.c_str());
  }
}