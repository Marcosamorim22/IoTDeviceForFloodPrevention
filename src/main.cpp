#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <PubSubClient.h>

// ================= Configurações de Rede =================
const char* ssid = "MVT-AnaLaura";
const char* password = "98012704AL";

// ================= Configurações do HiveMQ Cloud =========
const char* mqtt_server = "329132687fb349a09107e68a8fd32f5c.s1.eu.hivemq.cloud"; 
const int mqtt_port = 8883; // Porta segura
const char* mqtt_user = "marcos";
const char* mqtt_pass = "mama3CIN";

// ================= Configurações dos Pinos ===============
const int trigPin = 12; 
const int echoPin = 13; 
const float ALTURA_TOTAL_CM = 100.0; 
unsigned long tempoAnterior = 0;
const long intervalo = 2000; 


// pela porta ser segura tive usar a função  WifiClientSecure para criar uma conexao criptografada
WiFiClientSecure espClient;
PubSubClient client(espClient);

// inicia o modulo wifi com senha e usuario
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
// caso a conexão caia irá vir pra essa função
void reconnect() {
  // gera um novo id sempre para uma nova conexão para evitar uma conexão fantasma
  while (!client.connected()) {
    Serial.print("Tentando conexão segura com HiveMQ...");
    String clientId = "ESP8266Client-" + String(random(0xffff), HEX);
    
    // tenta conectar o usuario e senha no hivemq, se nao conectar espera 5 segun dos para tentar novamente
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
  espClient.setInsecure(); // para nao precisar de um certificado  do servidor
  client.setServer(mqtt_server, mqtt_port);
}

void loop() {
  if (!client.connected()){
    reconnect();
  }
  client.loop();

  unsigned long tempoAtual = millis();
  // ler dados a cada 2 segundos
  if (tempoAtual - tempoAnterior >= intervalo) {
    tempoAnterior = tempoAtual;
    digitalWrite(trigPin, LOW);
    delayMicroseconds(2);
    digitalWrite(trigPin, HIGH);
    delayMicroseconds(10);
    digitalWrite(trigPin, LOW);

    // calculos necessarios para saida "Distancia", "nivel da agua", "volume" e "porcentagem"
    long duracao = pulseIn(echoPin, HIGH);
    float distancia_vazia_cm = duracao * 0.034 / 2;
    float nivel_agua = ALTURA_TOTAL_CM - distancia_vazia_cm;
    if (nivel_agua < 0) nivel_agua = 0; 
    if (nivel_agua > ALTURA_TOTAL_CM) nivel_agua = ALTURA_TOTAL_CM; 


    float porcentagem = (nivel_agua / ALTURA_TOTAL_CM) * 100.0;

    float volume_maximo = 1000.0;
    float volume = (porcentagem / 100.0) * volume_maximo; 

    String payload = "{";
    payload += "\"volume\": " + String(volume, 2) + ", ";
    payload += "\"nivel_agua\": " + String(nivel_agua) + ", ";
    payload += "\"porcentagem\": " + String(porcentagem) + "}";

    client.publish("sensor/caixa/medicao", payload.c_str());
    Serial.print("Enviado: ");
    Serial.println(payload);
  }
}