ABSTRACT

As inundações recorrentes na cidade do Recife representam desafios críticos com severos impactos socioeconômicos e ambientais,
tornando o monitoramento contínuo e a implementação de ações preventivas essenciais. Este trabalho propõe um sistema de monitoramento híbrido
que integra dispositivos IoT de baixo custo, baseados em sensores ultrassônicos, ao engajamento ativo da população. A inovação da proposta reside
na utilização de Modelos de Linguagem de Grande Escala (LLMs) para processar relatos dos cidadãos, convertendo percepções informais em dados estruturados de risco e geolocalização. 
Essa abordagem une a telemetria física à inteligência social, utilizando a participação comunitária para validar e elevar a qualidade dos dados coletados pelos sensores.
O sistema é complementado por uma aplicação web distribuída para visualização em tempo real. Os resultados esperados incluem o fortalecimento da resiliência urbana em Recife
e a criação de um modelo de gestão de desastres mais ágil, democrático e fundamentado na colaboração entre tecnologia e sociedade.



#  Como Executar os Testes

### Passo 1: Clonar o Repositório
Abra o terminal do VS Code e execute este comando:
```bash
git clone https://github.com/Marcosamorim22/IoTDeviceForFloodPrevention.git
``` 




### Passo 2: Instalar a Extensão PlatformIO no VS Code
Abra o Visual Studio Code.

Clique no ícone de Extensões no menu lateral esquerdo (Ctrl + Shift + X ou Cmd + Shift + X).

Pesquise por PlatformIO IDE e clique em Install.

Aguarde a instalação concluir.

Vá na extensão platform.io > Open Folder... e abra a pasta do projeto que você clonou.

### Passo 3: Configurar a Placa no platformio.ini
Localize o arquivo platformio.ini na raiz do projeto. Substitua o conteúdo do arquivo de acordo com a placa que você está utilizando:
```bash
🔹 Opção A: Para ESP32
Ini, TOML
[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino
monitor_speed = 115200

🔹 Opção B: Para ESP8266 (ex: NodeMCU)
Ini, TOML
[env:nodemcuv2]
platform = espressif8266
board = nodemcuv2
framework = arduino
monitor_speed = 115200
Atenção: Salve o arquivo (Ctrl + S) após definir a placa correspondente.
``` 
### Passo 4: Conectar o Sensor à Placa
Com a placa desligada do computador, faça as conexões físicas dos pinos do sensor na ESP:

VCC (Sensor) ➔ 3.3V ou 5V (ESP) (verifique a voltagem do seu sensor)

GND (Sensor) ➔ GND (ESP)

Sinal / Data (Sensor) ➔ Pino GPIO definido no código (ex: GPIO 4 / D2)

### Passo 5: Compilar e Carregar o Código na ESP
Conecte a placa ESP ao computador utilizando um cabo USB de dados.

Na barra de status azul na parte inferior do VS Code:

Clique no ícone ✓ (Build) para compilar o código.

Clique no ícone ➔ (Upload) para gravar o programa na placa.

Clique no ícone de Tomada / Plugue (Serial Monitor) configurado para a taxa de 115200 baud para visualizar a inicialização e mensagens do sistema.

### Passo 6: Conectar ao Wi-Fi e Acessar a Interface Web
Certifique-se de que o seu computador/celular e a ESP estejam conectados na mesma rede Wi-Fi.

Acompanhe pelo Serial Monitor o endereço IP atribuído à placa (exemplo: 192.168.1.15).

Abra a página web hospedada acessando o link abaixo:

👉 [Clique aqui para acessar a Aplicação Web](https://marcosamorim22.github.io/IoTDeviceForFloodPrevention/)
