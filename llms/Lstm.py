import os
import json
import numpy as np
import pandas as pd
import paho.mqtt.client as mqtt
import google.generativeai as genai
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense

# ==========================================
# CONFIGURAÇÕES
# ==========================================
GEMINI_API_KEY = "AQ.Ab8RN6LYl-PWkXjywuxRtahX-9HnDLoqj0K8HKVevpuhuqL_CQ"
genai.configure(api_key=GEMINI_API_KEY)
llm = genai.GenerativeModel('gemini-3.5-flash')

MQTT_BROKER = "329132687fb349a09107e68a8fd32f5c.s1.eu.hivemq.cloud"
MQTT_PORT = 8883
MQTT_USER = "marcos"
MQTT_PASS = "mama3CIN"

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
    Y_treino = df_treino['nivel_agua_cm'].shift(-3).values # Prevê 3 passos (15 min) à frente
    
    X_treino = X_treino[:-3]
    Y_treino = Y_treino[:-3]
    X_treino = X_treino.reshape((X_treino.shape[0], 1, X_treino.shape[1]))
    
    print("Treinando a IA...")
    modelo_lstm.fit(X_treino, Y_treino, epochs=10, batch_size=32, verbose=0)
    print("Treinamento concluído!")
except FileNotFoundError:
    print("AVISO: historico_enchentes.csv não encontrado. LSTM sem treinamento.")


def gerar_alerta_llm(previsao_futura):
    prompt = f"""
    Você é a Defesa Civil. Dados atuais:
    - Água: {situacao_atual['nivel_agua_cm']} cm
    - Subindo a: {situacao_atual['velocidade']} cm/min
    - Pânico social (0 a 10): {situacao_atual['nota_social']}
    - Previsão p/ 15 min: {previsao_futura:.1f} cm.
    
    Escreva um alerta curto de emergência para a população baseado nisso.
    """
    resposta = llm.generate_content(prompt)
    print("\n ALERTA DA DEFESA CIVIL ")
    print(resposta.text)



def on_message(client, userdata, msg):
    topico = msg.topic
    carga = msg.payload.decode()
    
    if topico == "sensor/rua/medicao":
        dados = json.loads(carga)
        situacao_atual["nivel_agua_cm"] = dados["nivel_agua"]
        situacao_atual["velocidade"] = dados["velocidade"]
    elif topico == "sensor/rua/social":
        situacao_atual["nota_social"] = int(carga)
        
    print(f"[{topico}] -> {carga}")
    

    if situacao_atual["velocidade"] > 1.0 or situacao_atual["nota_social"] >= 6:
        dados_entrada = np.array([[[
            situacao_atual["nivel_agua_cm"], 
            situacao_atual["velocidade"], 
            situacao_atual["nota_social"]
        ]]])
        
        previsao = modelo_lstm.predict(dados_entrada, verbose=0)[0][0]
        print(f">>> Previsão LSTM (15 min): {previsao:.1f} cm")
        gerar_alerta_llm(previsao)
        
        
        situacao_atual["nota_social"] = 0

client = mqtt.Client(client_id="cerebro_ia_subscriber")
client.tls_set()
client.username_pw_set(MQTT_USER, MQTT_PASS)
client.on_message = on_message

client.connect(MQTT_BROKER, MQTT_PORT)
client.subscribe("sensor/rua/medicao")
client.subscribe("sensor/rua/social")

print("Cérebro Preditivo ONLINE e escutando a cidade...")
client.loop_forever()