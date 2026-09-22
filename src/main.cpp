#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <WiFiClientSecure.h>
#include <esp_sleep.h>

// ==========================================
// CONFIGURAÇÕES DE REDE E MQTT
// ==========================================
const char* nomeRede    = "CINGUESTS";
const char* senhaRede   = "acessocin";

const char* servidorMqtt = "329132687fb349a09107e68a8fd32f5c.s1.eu.hivemq.cloud";
const int   portaMqtt    = 8883;
const char* usuarioMqtt  = "marcos";
const char* senhaMqtt    = "mama3CIN";

// ==========================================
// CONFIGURAÇÕES DO SENSOR ULTRASSÔNICO
// ==========================================
const int pinoTrig = 18;   // atenção: pino de strapping no boot do ESP32
const int pinoEcho = 5;
const float ALTURA_TOTAL_CM = 200.0;

// ==========================================
// CONFIGURAÇÕES DE DEEP SLEEP / VELOCIDADE
// ==========================================
const float    VELOCIDADE_LIMITE_CM_MIN = 1.0;        
const uint32_t SONO_MAX_SEG             = 15;  
const uint32_t SONO_MIN_SEG             = 5;       
const unsigned long JANELA_ATIVA_MS     =  60 * 1000; 
const long     intervaloPublicacao      = 2000;
const long     intervaloVelocidadeAtivo = 5000; 

WiFiClientSecure clienteSeguro;
PubSubClient     clienteMqtt(clienteSeguro);

// ==========================================
// ESTADO QUE PRECISA SOBREVIVER AO DEEP SLEEP
// (RTC_DATA_ATTR mantém o valor entre ciclos de deep sleep no ESP32)
// ==========================================
RTC_DATA_ATTR bool     rtcInicializado     = false;
RTC_DATA_ATTR float    rtcNivelAnterior    = 0.0;
RTC_DATA_ATTR float    rtcKalmanEstimativa = 0.0;
RTC_DATA_ATTR float    rtcKalmanErro       = 1.0;
RTC_DATA_ATTR uint32_t rtcUltimoSonoSeg    = 0;  // duração do último deep sleep, usada p/ estimar delta-t

const float kalman_Q = 0.05; // velocidade de mudança real
const float kalman_R = 2.0;  // ruído do sensor

float aplicarKalman(float medidaBruta) {
  float predicao_erro = rtcKalmanErro + kalman_Q;
  float K = predicao_erro / (predicao_erro + kalman_R);
  rtcKalmanEstimativa = rtcKalmanEstimativa + K * (medidaBruta - rtcKalmanEstimativa);
  rtcKalmanErro = (1 - K) * predicao_erro;
  return rtcKalmanEstimativa;
}

// ==========================================
// FUNÇÕES DE CONEXÃO
// ==========================================
void conectarWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(nomeRede, senhaRede);
  Serial.print("Conectando WiFi");
  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 15000) {
    delay(300);
    Serial.print(".");
  }
  Serial.println(WiFi.status() == WL_CONNECTED ? " conectado!" : " falhou!");
}

bool conectarMqtt() {
  if (clienteMqtt.connected()) return true;
  String idCliente = "ESP32-" + String(random(0xffff), HEX);
  Serial.print("Conectando MQTT...");
  if (clienteMqtt.connect(idCliente.c_str(), usuarioMqtt, senhaMqtt)) {
    Serial.println(" ok!");
    return true;
  }
  Serial.print(" falhou, rc=");
  Serial.println(clienteMqtt.state());
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

  if (validas < 3) {
    Serial.print("Mediana descartada: apenas ");
    Serial.print(validas);
    Serial.println(" leituras validas.");
    return -1;
  }

  ordenar(leituras, validas);
  return leituras[validas / 2];
}

// ==========================================
// PUBLICAÇÃO
// ==========================================
void publicar(float nivel, float velocidade) {
  String carga = "{\"nivel_agua\": " + String(nivel, 2) + ", \"velocidade\": " + String(velocidade, 2) + "}";
  if (clienteMqtt.publish("sensor/rua/medicao", carga.c_str())) {
    Serial.println("Enviado: " + carga);
  } else {
    Serial.println("Falha ao publicar!");
  }
}

// ==========================================
// CALCULA QUANTO TEMPO DORMIR (proporcional à velocidade)
// velocidade = 0        -> SONO_MAX_SEG (15 min)
// velocidade = LIMITE   -> SONO_MIN_SEG (1 min)
// ==========================================
uint32_t calcularTempoSonoSeg(float velocidadeAbs) {
  float v = constrain(velocidadeAbs, 0.0, VELOCIDADE_LIMITE_CM_MIN);
  float fracao = v / VELOCIDADE_LIMITE_CM_MIN; // 0 (parado) .. 1 (no limite)
  uint32_t tempo = SONO_MAX_SEG - (uint32_t)(fracao * (SONO_MAX_SEG - SONO_MIN_SEG));
  return tempo;
}

void irDormir(uint32_t segundos) {
  Serial.print("Indo para deep sleep por ");
  Serial.print(segundos);
  Serial.println(" segundos.");
  rtcUltimoSonoSeg = segundos;
  clienteMqtt.disconnect();
  WiFi.disconnect(true);
  esp_sleep_enable_timer_wakeup((uint64_t)segundos * 1000000ULL);
  esp_deep_sleep_start();
  // não retorna: o chip reinicia ao acordar
}

// ==========================================
// MODO ATIVO: fica acordado monitorando enquanto a velocidade
// estiver acima do limite (sem deep sleep)
// ==========================================
void modoAtivo(float nivelAtualInicial) {
  Serial.println("Entrando em modo ativo (velocidade acima do limite).");
  unsigned long inicioJanela = millis();
  unsigned long tempoUltimaPublicacao = millis();
  unsigned long tempoUltimoCalcVelocidade = millis();
  float nivelAnteriorLocal = nivelAtualInicial;
  float velocidadeLocal = 0.0;

  while (millis() - inicioJanela < JANELA_ATIVA_MS) {
    if (!clienteMqtt.connected()) {
      conectarMqtt();
    }
    clienteMqtt.loop();

    unsigned long agora = millis();
    if (agora - tempoUltimaPublicacao >= intervaloPublicacao) {
      tempoUltimaPublicacao = agora;

      float distanciaMediana = lerDistanciaMedianaCM();
      if (distanciaMediana >= 0) {
        float distanciaSuavizada = aplicarKalman(distanciaMediana);
        float nivelAtual = constrain(ALTURA_TOTAL_CM - distanciaSuavizada, 0, ALTURA_TOTAL_CM);

        if (agora - tempoUltimoCalcVelocidade >= intervaloVelocidadeAtivo) {
          float deltaMin = (agora - tempoUltimoCalcVelocidade) / 60000.0;
          velocidadeLocal = (nivelAtual - nivelAnteriorLocal) / deltaMin;
          nivelAnteriorLocal = nivelAtual;
          tempoUltimoCalcVelocidade = agora;
        }

        publicar(nivelAtual, velocidadeLocal);
        rtcNivelAnterior = nivelAtual;
      }
    }
  }

  // Janela ativa terminou: decide se continua ativo ou volta a dormir
  if (fabs(velocidadeLocal) >= VELOCIDADE_LIMITE_CM_MIN) {
    modoAtivo(rtcNivelAnterior); // ainda variando rápido, continua ativo
  } else {
    uint32_t sono = calcularTempoSonoSeg(fabs(velocidadeLocal));
    irDormir(sono);
  }
}

// ==========================================
// SETUP (todo o trabalho acontece aqui; loop() fica vazio)
// ==========================================
void setup() {
  Serial.begin(115200);
  pinMode(pinoTrig, OUTPUT);
  pinMode(pinoEcho, INPUT);

  esp_sleep_wakeup_cause_t causa = esp_sleep_get_wakeup_cause();
  Serial.print("Causa do boot: ");
  Serial.println(causa == ESP_SLEEP_WAKEUP_TIMER ? "timer (deep sleep)" : "power-on/reset");

  conectarWifi();
  clienteSeguro.setInsecure();
  clienteMqtt.setServer(servidorMqtt, portaMqtt);
  conectarMqtt();

  float distanciaMediana = lerDistanciaMedianaCM();

  if (!rtcInicializado) {
    // Primeiro boot de todos (energizou agora): sem histórico ainda
    if (distanciaMediana < 0) distanciaMediana = ALTURA_TOTAL_CM; // fallback
    rtcKalmanEstimativa = distanciaMediana;
    rtcKalmanErro = 1.0;
    float nivelInicial = constrain(ALTURA_TOTAL_CM - distanciaMediana, 0, ALTURA_TOTAL_CM);
    rtcNivelAnterior = nivelInicial;
    rtcInicializado = true;

    publicar(nivelInicial, 0.0);
    irDormir(SONO_MAX_SEG);
    return;
  }

  if (distanciaMediana < 0) {
    Serial.println("Leitura invalida no boot, tentando novamente em 1 min.");
    irDormir(SONO_MIN_SEG);
    return;
  }

  float distanciaSuavizada = aplicarKalman(distanciaMediana);
  float nivelAtual = constrain(ALTURA_TOTAL_CM - distanciaSuavizada, 0, ALTURA_TOTAL_CM);

  // Estima o tempo decorrido usando a duração do último sono
  // (aproximação: ignora os poucos segundos gastos conectando)
  float deltaMin = max(rtcUltimoSonoSeg, (uint32_t)1) / 60.0;
  float velocidade = (nivelAtual - rtcNivelAnterior) / deltaMin;

  rtcNivelAnterior = nivelAtual;
  publicar(nivelAtual, velocidade);

  if (fabs(velocidade) >= VELOCIDADE_LIMITE_CM_MIN) {
    modoAtivo(nivelAtual);
  } else {
    uint32_t sono = calcularTempoSonoSeg(fabs(velocidade));
    irDormir(sono);
  }
}

void loop() {
  // Nunca é executado: setup() sempre termina em deep sleep ou modo ativo (while).
}