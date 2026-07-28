import os
import json
import google.generativeai as genai
import paho.mqtt.client as mqtt
from telegram import Update
from telegram.ext import ApplicationBuilder, MessageHandler, filters, ContextTypes

TELEGRAM_TOKEN = "8793721871:AAFpdDR3oLOzV9bx0vN26DgjeaaNIV4DgB8"
GEMINI_API_KEY = "AQ.Ab8RN6LYl-PWkXjywuxRtahX-9HnDLoqj0K8HKVevpuhuqL_CQ"

MQTT_BROKER = "329132687fb349a09107e68a8fd32f5c.s1.eu.hivemq.cloud"
MQTT_PORT = 8883
MQTT_USER = "marcos"
MQTT_PASS = "mama3CIN"


genai.configure(api_key=GEMINI_API_KEY)
modelo_ia = genai.GenerativeModel('gemini-3.5-flash')


mqtt_client = mqtt.Client(client_id="bot_telegram_publisher")
mqtt_client.tls_set()
mqtt_client.username_pw_set(MQTT_USER, MQTT_PASS)


PROMPT_SISTEMA = """
Você é um sistema rigoroso de telemetria de enchentes. 
Sua única função é ler a mensagem do morador e classificar o risco de alagamento atual com uma nota de 0 a 10.

CRITÉRIOS:
0: Assuntos aleatórios ou mensagens sem relação com chuva.
1 a 3: Menções a chuva normal, céu escuro.
4 a 6: Chuva forte contínua, poças, bueiro cheio.
7 a 9: Água invadindo calçada, dificuldade de transitar.
10: Alagamento extremo, água nas casas, carros boiando.

REGRA DE FERRO: Responda APENAS com o número (ex: 8).
"""


async def processar_mensagem(update: Update, context: ContextTypes.DEFAULT_TYPE):
    texto_recebido = update.message.text
    
    try:
        
        comando = f"{PROMPT_SISTEMA}\n\nMensagem do morador: '{texto_recebido}'"
        resposta_ia = modelo_ia.generate_content(comando)
        nota_risco = int(resposta_ia.text.strip())
        
        print(f"Mensagem: '{texto_recebido}' -> Risco: {nota_risco}/10")
        

        if not mqtt_client.is_connected():
            mqtt_client.connect(MQTT_BROKER, MQTT_PORT)
        mqtt_client.publish("sensor/rua/social", str(nota_risco))

        if nota_risco >= 7:
            await update.message.reply_text(f"Alerta registrado no sistema! Risco: {nota_risco}/10")
            
    except Exception as e:
        print(f"Erro ao processar: {e}")

if __name__ == '__main__':
    print("Bot do Telegram Iniciado!")
    mqtt_client.connect(MQTT_BROKER, MQTT_PORT)
    mqtt_client.loop_start() 
    
    app = ApplicationBuilder().token(TELEGRAM_TOKEN).build()
    app.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), processar_mensagem))
    app.run_polling()