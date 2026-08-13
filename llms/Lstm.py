import os
import json
import numpy as np
import pandas as pd
import paho.mqtt.client as mqtt
import ollama
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense

# ==========================================
# CONFIGURAÇÕES
# ==========================================
MQTT_BROKER = "329132687fb349a09107e68a8fd32f5c.s1.eu.hivemq.cloud"
MQTT_PORT = 8883
MQTT_USER = "marcos"
MQTT_PASS = "mama3CIN"

TOPIC_MEDICAO = "sensor/rua/medicao"
TOPIC_SOCIAL = "sensor/rua/social"
TOPIC_PREVISAO = "sensor/rua/previsao"  


MODELO_OLLAMA = "llama3.2"

situacao_atual = {
    "nivel_agua_cm": 0.0,
    "velocidade": 0.0,
    "nota_social": 0
}

print("Construindo o modelo LSTM...")
modelo_lstm = Sequential()
modelo_lstm.add(LSTM(50, activation='relu', input_shape=(1, 3)))
modelo_lstm.add(Dense(1))
modelo_lstm.compile(optimizer='adam', loss='mse')

try:
    print("Carregando histórico para treinamento...")
    df_treino = pd.read_csv("historico_enchentes.csv")
    X_treino = df_treino[['nivel_agua_cm', 'velocidade', 'nota_social']].values
    Y_treino = df_treino['nivel_agua_cm'].shift(-3).values  

    X_treino = X_treino[:-3]
    Y_treino = Y_treino[:-3]
    X_treino = X_treino.reshape((X_treino.shape[0], 1, X_treino.shape[1]))

    print("Treinando a IA...")
    modelo_lstm.fit(X_treino, Y_treino, epochs=10, batch_size=32, verbose=0)
    print("Treinamento concluído!")
except FileNotFoundError:
    print("AVISO: historico_enchentes.csv não encontrado. LSTM sem treinamento.")


def publicar_previsao(client, previsao_futura):
    """
    NOVO: publica a previsão do LSTM no tópico MQTT dedicado, para que o
    dashboard React consuma na aba "Previsão IA".
    """
    payload_previsao = {
        "timestamp": pd.Timestamp.now().isoformat(),
        "nivel_atual_cm": situacao_atual["nivel_agua_cm"],
        "previsao_15min_cm": float(previsao_futura),
        "velocidade": situacao_atual["velocidade"],
    }
    client.publish(TOPIC_PREVISAO, json.dumps(payload_previsao))
    print(f">>> Previsão publicada em '{TOPIC_PREVISAO}': {payload_previsao}")


def gerar_alerta_llm(previsao_futura):
    prompt_sistema = """
    Você é o módulo emissor de alertas técnicos da Defesa Civil.
    Escreva um alerta curto de emergência direcionado à população, com base
    exclusivamente nos dados numéricos fornecidos.
    Seja objetivo, direto e claro. Não invente números que não foram passados.
    """

    prompt_usuario = f"""
    Dados atuais do sensor:
    - Nível da Água: {situacao_atual['nivel_agua_cm']} cm
    - Velocidade de subida: {situacao_atual['velocidade']} cm/min
    - Índice de engajamento social de risco (0 a 10): {situacao_atual['nota_social']}
    - Modelo Preditivo LSTM (15 min): {previsao_futura:.1f} cm.
    """

    try:
        resposta = ollama.chat(
            model=MODELO_OLLAMA,
            messages=[
                {"role": "system", "content": prompt_sistema},
                {"role": "user", "content": prompt_usuario}
            ]
        )
        print("\n📢 ALERTA DA DEFESA CIVIL EMITIDO PELO OLLAMA 📢")
        print(resposta['message']['content'].strip())
        print("-" * 50)
    except Exception as e:
        print(f"Erro ao gerar alerta com Ollama: {e}")


def on_message(client, userdata, msg):
    topico = msg.topic
    carga = msg.payload.decode()
    print(f"[{topico}] -> {carga}")

    if topico == TOPIC_MEDICAO:
        dados = json.loads(carga)
        situacao_atual["nivel_agua_cm"] = dados["nivel_agua"]
        situacao_atual["velocidade"] = dados["velocidade"]
    elif topico == TOPIC_SOCIAL:
        try:
            dados_sociais = json.loads(carga)
            situacao_atual["nota_social"] = int(dados_sociais["nota"])
        except json.JSONDecodeError:
            situacao_atual["nota_social"] = int(carga)

    if situacao_atual["velocidade"] > 1.0 or situacao_atual["nota_social"] >= 6:
        dados_entrada = np.array([[[
            situacao_atual["nivel_agua_cm"],
            situacao_atual["velocidade"],
            situacao_atual["nota_social"]
        ]]])

        previsao = modelo_lstm.predict(dados_entrada, verbose=0)[0][0]
        print(f">>> Previsão LSTM (15 min): {previsao:.1f} cm")

        publicar_previsao(client, previsao)  
        gerar_alerta_llm(previsao)

        situacao_atual["nota_social"] = 0


client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="cerebro_ia_subscriber")
client.tls_set()
client.username_pw_set(MQTT_USER, MQTT_PASS)
client.on_message = on_message

client.connect(MQTT_BROKER, MQTT_PORT)
client.subscribe(TOPIC_MEDICAO)
client.subscribe(TOPIC_SOCIAL)

print("Cérebro Preditivo ONLINE (com Ollama) e escutando a cidade...")
client.loop_forever()