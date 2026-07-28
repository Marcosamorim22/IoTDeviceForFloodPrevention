import pandas as pd
import numpy as np
from datetime import datetime, timedelta

print("Gerando dados históricos sintéticos...")

tempo_inicial = datetime.now() - timedelta(days=5)
intervalo = timedelta(minutes=5)
total_leituras = 24 * 12 * 5  # 5 dias

registros = []
nivel_atual = 5.0 

for i in range(total_leituras):
    tempo_atual = tempo_inicial + (i * intervalo)
    velocidade = np.random.uniform(-0.1, 0.1)
    nota_social = 0
    
    # Simula Tempestade 1 (Alto risco e água subindo)
    if 400 < i < 430: 
        velocidade = np.random.uniform(1.0, 3.5) 
        nota_social = np.random.randint(6, 10)   
    
    # Simula Tempestade 2
    elif 900 < i < 940:
        velocidade = np.random.uniform(1.5, 4.0)
        nota_social = np.random.randint(7, 10)
    
    # Drenagem natural
    elif nivel_atual > 10.0:
        velocidade = np.random.uniform(-0.5, -0.1)
        nota_social = np.random.randint(0, 3)

    nivel_atual += velocidade
    if nivel_atual < 0: nivel_atual = 0.0
    
    registros.append({
        "data_hora": tempo_atual.strftime("%Y-%m-%d %H:%M:%S"),
        "nivel_agua_cm": round(nivel_atual, 2),
        "velocidade": round(velocidade, 2),
        "nota_social": nota_social
    })

df = pd.DataFrame(registros)
df.to_csv("historico_enchentes.csv", index=False)
print(f"Arquivo 'historico_enchentes.csv' gerado com sucesso! ({len(df)} linhas)")