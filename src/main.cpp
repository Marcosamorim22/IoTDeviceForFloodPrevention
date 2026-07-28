#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <PubSubClient.h>

// ==========================================
// CONFIGURAÇÕES DE REDE E MQTT
// ==========================================
const char* nomeRede    = "MVT-AnaLaura";
const char* senhaRede   = "98012704AL";

const char* servidorMqtt = "329132687fb349a09107e68a8fd32f5c.s1.eu.hivemq.cloud";
const int   portaMqtt    = 8883;
const char* usuarioMqtt  = "marcos";
const char* senhaMqtt    = "mama3CIN";

// ==========================================
// CONFIGURAÇÕES DO SENSOR ULTRASSÔNICO
// ==========================================
const int pinoTrig = 14;  // D5
const int pinoEcho = 13;  // D7
const float ALTURA_TOTAL_CM = 200.0;

unsigned long tempoUltimaPublicacao = 0;
const long    intervaloPublicacao   = 2000;   // Publica a cada 2 segundos
unsigned long tempoUltimaReconexao = 0;
const long    intervaloReconexao   = 5000;    

float         nivelAnterior            = 0.0;
unsigned long tempoUltimoCalcVelocidade = 0;
float         velocidade               = 0.0;   // cm/min
const long    intervaloVelocidade      = 5000;  

WiFiClientSecure clienteSeguro;
PubSubClient     clienteMqtt(clienteSeguro);

// ==========================================
// FILTRO DE KALMAN (Suaviza marolas da água)
// ==========================================
float kalman_estimativa = 0.0;
float kalman_erro       = 1.0;
float kalman_Q          = 0.05; // Velocidade de mudança real
float kalman_R          = 2.0;  // Ruído do sensor

float aplicarKalman(float medidaBruta) {
  float predicao_erro = kalman_erro + kalman_Q;
  float K = predicao_erro / (predicao_erro + kalman_R);
  kalman_estimativa = kalman_estimativa + K * (medidaBruta - kalman_estimativa);
  kalman_erro = (1 - K) * predicao_erro;
  return kalman_estimativa;
}

// ==========================================
// FUNÇÕES DE CONEXÃO
// ==========================================
void conectarWifi() {
  delay(10);
  Serial.print("\nConectando na rede: ");
  Serial.println(nomeRede);
  WiFi.begin(nomeRede, senhaRede);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWiFi conectado!");
}

bool tentarReconectar() {
  unsigned long agora = millis();
  if (agora - tempoUltimaReconexao < intervaloReconexao) return false;
  tempoUltimaReconexao = agora;

  String idCliente = "ESP8266-" + String(random(0xffff), HEX);
  if (clienteMqtt.connect(idCliente.c_str(), usuarioMqtt, senhaMqtt)) {
    Serial.println("MQTT Conectado!");
    return true;
  }
  return false;
}

// ==========================================
// LEITURA DO SENSOR (Filtro de Mediana)
// ==========================================
const int TOTAL_LEITURAS = 5;

float lerDistanciaBruta() {
  digitalWrite(pinoTrig, LOW);
  delayMicroseconds(2);
  digitalWrite(pinoTrig, HIGH);
  delayMicroseconds(10);
  digitalWrite(pinoTrig, LOW);
  long duracao = pulseIn(pinoEcho, HIGH, 30000);
  if (duracao == 0) return -1;
  return duracao * 0.034 / 2.0;
}

void ordenar(float* arr, int n) {
  for (int i = 1; i < n; i++) {
    float chave = arr[i];
    int j = i - 1;
    while (j >= 0 && arr[j] > chave) {
      arr[j + 1] = arr[j];
      j--;
    }
    arr[j + 1] = chave;
  }
}

float lerDistanciaMedianaCM() {
  float leituras[TOTAL_LEITURAS];
  int validas = 0;
  for (int i = 0; i < TOTAL_LEITURAS; i++) {
    float d = lerDistanciaBruta();
    if (d >= 0) { leituras[validas++] = d; }
    delay(30); 
  }
  if (validas < 3) return -1;
  ordenar(leituras, validas);
  return leituras[validas / 2]; 
}

// ==========================================
// SETUP E LOOP
// ==========================================
void setup() {
  Serial.begin(115200);
  pinMode(pinoTrig, OUTPUT);
  pinMode(pinoEcho, INPUT);
  
  conectarWifi();
  clienteSeguro.setInsecure();
  clienteMqtt.setServer(servidorMqtt, portaMqtt);

  for (int tentativa = 0; tentativa < 10; tentativa++) {
    float distanciaInicial = lerDistanciaMedianaCM();
    if (distanciaInicial >= 0) {
      kalman_estimativa = distanciaInicial; 
      nivelAnterior = constrain(ALTURA_TOTAL_CM - distanciaInicial, 0, ALTURA_TOTAL_CM);
      break;
    }
    delay(200);
  }
  tempoUltimoCalcVelocidade = millis();
}

void loop() {
  if (!clienteMqtt.connected()) {
    tentarReconectar();
    return;
  }
  clienteMqtt.loop();

  unsigned long agora = millis();

  if ((agora - tempoUltimoCalcVelocidade >= intervaloVelocidade) || (agora - tempoUltimaPublicacao >= intervaloPublicacao)) {
    float distanciaMediana = lerDistanciaMedianaCM();
    if (distanciaMediana < 0) return; 

    // Aplica o Filtro de Kalman
    float distanciaSuavizada = aplicarKalman(distanciaMediana);
    float nivelAtual = constrain(ALTURA_TOTAL_CM - distanciaSuavizada, 0, ALTURA_TOTAL_CM);

    // Calcula Velocidade
    if (agora - tempoUltimoCalcVelocidade >= intervaloVelocidade) {
      float deltaMinutos = (agora - tempoUltimoCalcVelocidade) / 60000.0;
      velocidade = (nivelAtual - nivelAnterior) / deltaMinutos;
      nivelAnterior = nivelAtual;
      tempoUltimoCalcVelocidade = agora;
    }

    // Publica no MQTT
    if (agora - tempoUltimaPublicacao >= intervaloPublicacao) {
      tempoUltimaPublicacao = agora;
      String carga = "{\"nivel_agua\": " + String(nivelAtual, 2) + ", \"velocidade\": " + String(velocidade, 2) + "}";
      clienteMqtt.publish("sensor/rua/medicao", carga.c_str());
    }
  }
}