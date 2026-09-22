import json
import paho.mqtt.client as mqtt
from supabase import create_client

SUPABASE_URL = "https://hpwsbxzlanuxsnnlotgz.supabase.co"
SUPABASE_KEY = "sb_secret_C9lIr6auzeslKqd_AJv-JA_Gaw2y9JA"

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def on_message(client, userdata, msg):
    payload = json.loads(msg.payload.decode())
    supabase.table("leituras").insert({
        "nivel_agua": payload["nivel_agua"],
        "velocidade": payload["velocidade"],
    }).execute()
    print("Gravado:", payload)

client = mqtt.Client()
client.username_pw_set("marcos", "mama3CIN")
client.tls_set()
client.on_message = on_message
client.connect("329132687fb349a09107e68a8fd32f5c.s1.eu.hivemq.cloud", 8883)
client.subscribe("sensor/rua/medicao")
print("Aguardando mensagens MQTT...")
client.loop_forever()