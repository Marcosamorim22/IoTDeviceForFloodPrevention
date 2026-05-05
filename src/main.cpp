#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <PubSubClient.h>

// ================= Configurações de Rede =================
const char* ssid = "CINGUESTS";
const char* password = "acessocin";

// ================= Configurações do HiveMQ Cloud =========
const char* mqtt_server = "329132687fb349a09107e68a8fd32f5c.s1.eu.hivemq.cloud"; 
const int mqtt_port = 8883; // Porta segura!
const char* mqtt_user = "marcos";
const char* mqtt_pass = "mama3CIN";

// ================= Configurações dos Pinos ===============
const int trigPin = 12; 
const int echoPin = 13; 
const float ALTURA_TOTAL_CM = 100.0; 
unsigned long tempoAnterior = 0;
const long intervalo = 2000; 

// A GRANDE MUDANÇA: Usar WiFiClientSecure em vez de WiFiClient normal
WiFiClientSecure espClient;
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
  Serial.println("\nWiFi conectado!");
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Tentando conexão segura com HiveMQ...");
    String clientId = "ESP8266Client-" + String(random(0xffff), HEX);
    
    // Agora enviamos o Usuário e Senha na conexão!
    if (client.connect(clientId.c_str(), mqtt_user, mqtt_pass)) {
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
  espClient.setInsecure(); 
  client.setServer(mqtt_server, mqtt_port);
}

void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  unsigned long tempoAtual = millis();
  if (tempoAtual - tempoAnterior >= intervalo) {
    tempoAnterior = tempoAtual;
    digitalWrite(trigPin, LOW);
    delayMicroseconds(2);
    digitalWrite(trigPin, HIGH);
    delayMicroseconds(10);
    digitalWrite(trigPin, LOW);

    long duracao = pulseIn(echoPin, HIGH);
    float distancia_vazia_cm = duracao * 0.034 / 2;
    float nivel_agua_cm = ALTURA_TOTAL_CM - distancia_vazia_cm;
    if (nivel_agua_cm < 0) nivel_agua_cm = 0; 
    if (nivel_agua_cm > ALTURA_TOTAL_CM) nivel_agua_cm = ALTURA_TOTAL_CM; 


    float porcentagem = (nivel_agua_cm / ALTURA_TOTAL_CM) * 100.0;

    float volume_maximo_litros = 1000.0;
    float volume_agua_litros = (porcentagem / 100.0) * volume_maximo_litros; 

    String payload = "{";
    payload += "\"volume_agua_litros\": " + String(volume_agua_litros, 2) + ", ";
    payload += "\"nivel_agua_cm\": " + String(nivel_agua_cm) + ", ";
    payload += "\"porcentagem\": " + String(porcentagem) + "}";

    client.publish("marcos/caixa/nivel", payload.c_str());
    Serial.print("Enviado: ");
    Serial.println(payload);
  }
}