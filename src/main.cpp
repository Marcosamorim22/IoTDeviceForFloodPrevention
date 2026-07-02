#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <PubSubClient.h>

const char* nomeRede    = "MVT-AnaLaura";
const char* senhaRede   = "98012704AL";

const char* servidorMqtt = "329132687fb349a09107e68a8fd32f5c.s1.eu.hivemq.cloud";
const int   portaMqtt    = 8883;
const char* usuarioMqtt  = "marcos";
const char* senhaMqtt    = "mama3CIN";

const int pinoTrig = 14;  // D5
const int pinoEcho = 13;  // D7
const float ALTURA_TOTAL_CM = 200.0;


unsigned long tempoUltimaPublicacao = 0;
const long    intervaloPublicacao   = 2000;   // publica a cada 2s

unsigned long tempoUltimaReconexao = 0;
const long    intervaloReconexao   = 5000;    // tenta reconectar a cada 5s


float         nivelAnterior            = 0.0;
unsigned long tempoUltimoCalcVelocidade = 0;
float         velocidade               = 0.0;   // cm/min
const long    intervaloVelocidade      = 5000;  // recalcula a cada 5s

WiFiClientSecure clienteSeguro;
PubSubClient     clienteMqtt(clienteSeguro);


void conectarWifi() {
  delay(10);
  Serial.println();
  Serial.print("Conectando na rede: ");
  Serial.println(nomeRede);
  WiFi.begin(nomeRede, senhaRede);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi conectado! IP: " + WiFi.localIP().toString());
}


// Retorna true se conectado (ou reconectou), false caso contrário.
bool tentarReconectar() {
  unsigned long agora = millis();
  if (agora - tempoUltimaReconexao < intervaloReconexao) {
    return false;  // ainda dentro do intervalo de espera
  }
  tempoUltimaReconexao = agora;

  Serial.print("Tentando conexão MQTT...");
  String idCliente = "ESP8266-" + String(random(0xffff), HEX);

  if (clienteMqtt.connect(idCliente.c_str(), usuarioMqtt, senhaMqtt)) {
    Serial.println("Conectado!");
    return true;
  }

  Serial.print("Falhou, rc=");
  Serial.print(clienteMqtt.state());
  Serial.println(" — próxima tentativa em 5s.");
  return false;
}


const int TOTAL_LEITURAS = 5;

// Leitura bruta — retorna -1 se timeout
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

// Ordena array por insertion sort (simples e eficiente para arrays pequenos)
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

// Coleta 5 leituras, descarta inválidas e retorna a mediana.
// Retorna -1 se menos de 3 leituras forem válidas.
float lerDistanciaMedianaCM() {
  float leituras[TOTAL_LEITURAS];
  int validas = 0;

  for (int i = 0; i < TOTAL_LEITURAS; i++) {
    float d = lerDistanciaBruta();
    if (d >= 0) {
      leituras[validas] = d;
      validas++;
    }
    delay(30); // aguarda eco residual dissipar
  }

  // Exige mínimo de 3 leituras válidas para calcular mediana confiável
  if (validas < 3) {
    Serial.print("Mediana descartada: apenas ");
    Serial.print(validas);
    Serial.println(" leituras validas.");
    return -1;
  }

  ordenar(leituras, validas);

  float mediana = leituras[validas / 2];

  Serial.print("Leituras [");
  for (int i = 0; i < validas; i++) {
    Serial.print(leituras[i], 1);
    if (i < validas - 1) Serial.print(", ");
  }
  Serial.print("] → Mediana: ");
  Serial.print(mediana, 1);
  Serial.println(" cm");

  return mediana;
}


void setup() {
  Serial.begin(115200);
  pinMode(pinoTrig, OUTPUT);
  pinMode(pinoEcho, INPUT);
  conectarWifi();
  clienteSeguro.setInsecure();
  clienteMqtt.setServer(servidorMqtt, portaMqtt);

  // Inicializa nivelAnterior com a primeira leitura válida do sensor.
  // Tenta até 10 vezes para não ficar preso se o sensor falhar uma vez.
  for (int tentativa = 0; tentativa < 10; tentativa++) {
    float distanciaInicial = lerDistanciaMedianaCM();
    if (distanciaInicial >= 0) {
      nivelAnterior = constrain(ALTURA_TOTAL_CM - distanciaInicial, 0, ALTURA_TOTAL_CM);
      Serial.println("Nivel inicial: " + String(nivelAnterior, 1) + " cm");
      break;
    }
    delay(200);
  }
  tempoUltimoCalcVelocidade = millis();
}


void loop() {
  //não bloqueia o loop enquanto reconecta
  if (!clienteMqtt.connected()) {
    tentarReconectar();
    return;  // aguarda próxima iteração sem tentar publicar
  }
  clienteMqtt.loop();

  unsigned long agora = millis();

  // ── Cálculo de velocidade (a cada 5s) ─────────────────
  if (agora - tempoUltimoCalcVelocidade >= intervaloVelocidade) {
    float distancia = lerDistanciaMedianaCM();
    if (distancia >= 0) {
      float nivelAtual      = constrain(ALTURA_TOTAL_CM - distancia, 0, ALTURA_TOTAL_CM);
      float deltaMinutos    = (agora - tempoUltimoCalcVelocidade) / 60000.0;
      velocidade            = (nivelAtual - nivelAnterior) / deltaMinutos;
      nivelAnterior         = nivelAtual;
    }
    tempoUltimoCalcVelocidade = agora;
  }

  // ── Publicação a cada 2s ───────────────────────────────
  if (agora - tempoUltimaPublicacao >= intervaloPublicacao) {
    tempoUltimaPublicacao = agora;

    float distanciaCM = lerDistanciaMedianaCM();
    if (distanciaCM < 0) {
      Serial.println("Erro: leitura inválida do sensor.");
      return;
    }

    float nivelAgua = constrain(ALTURA_TOTAL_CM - distanciaCM, 0, ALTURA_TOTAL_CM);

    String carga = "{";
    carga += "\"nivel_agua\": "  + String(nivelAgua,  2) + ", ";
    carga += "\"velocidade\": "  + String(velocidade, 2) + "}";

    if (clienteMqtt.publish("sensor/rua/medicao", carga.c_str())) {
      Serial.println("Enviado: " + carga);
    } else {
      Serial.println("Falha ao publicar!");
    }
  }
}