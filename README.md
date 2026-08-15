ABSTRACT

As inundações recorrentes na cidade do Recife representam desafios críticos com severos impactos socioeconômicos e ambientais,
tornando o monitoramento contínuo e a implementação de ações preventivas essenciais. Este trabalho propõe um sistema de monitoramento híbrido
que integra dispositivos IoT de baixo custo, baseados em sensores ultrassônicos, ao engajamento ativo da população. A inovação da proposta reside
na utilização de Modelos de Linguagem de Grande Escala (LLMs) para processar relatos dos cidadãos, convertendo percepções informais em dados estruturados de risco e geolocalização. 
Essa abordagem une a telemetria física à inteligência social, utilizando a participação comunitária para validar e elevar a qualidade dos dados coletados pelos sensores.
O sistema é complementado por uma aplicação web distribuída para visualização em tempo real. Os resultados esperados incluem o fortalecimento da resiliência urbana em Recife
e a criação de um modelo de gestão de desastres mais ágil, democrático e fundamentado na colaboração entre tecnologia e sociedade.



#  Como Executar os Testes 

Para executar os testes, siga os passos abaixo: criação do ambiente virtual, instalação do Ollama e do modelo LLM, instalação das bibliotecas Python necessárias e, por fim, configuração do sensor na placa.

### Passo 1: Clonar o Repositório
Abra o terminal do VS Code e execute este comando:
```bash
git clone https://github.com/Marcosamorim22/IoTDeviceForFloodPrevention.git
``` 
### Passo 2: Criar o ambiente virtual 

  Abra o terminal do Vs code  e execute este comando:

  #### Linux:
```bash
  python3 -m venv venv
  source venv/bin/activate
```
#### Windows(cmd):
```bash
    python -m venv venv
    venv\Scripts\activate
```
#### Windows(PowerShell):
```bash
    python -m venv venv
    .\venv\Scripts\Activate.ps1
```
#### Se der erro de permissão no Powershell rode:
```bash
  Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```
### Passo 3: Instalação do ollama
  #### Windows:
  Baixe o instalador em [https://ollama.com/download](https://ollama.com/download)
  
  Após isso Execute .exe e siga o instalador (next,next,finish)  
  ### Linux:
  Execute esse comando no terminal
  ```bash
    curl -fsSL https://ollama.com/install.sh | sh
  ```
  ### Passo 4: Instalação llama3.2
  Execute essa linha no vs code
  ```bash
    ollama pull llama3.2
  ```
  Para testar se baixou com sucesso use o comando
  ```bash
  ollama list
  ```
### Passo 5: Baixar todas as bibliotecas necessarias
  > Observação: verifique a versão do seu python, ela deverá ser 3.11.xxx

  #### Instalação do python 3.11:
  
  Windows:
  
  Acesse a página oficial da versão 3.11.x:
  
  [Python 3.11.9 — página oficial](https://www.python.org/downloads/release/python-3119/?utm_source=chatgpt.com)  
  
  Na seção Files, procure:  
  
  Windows installer (64-bit)  
  

  Ubuntu: Execute essa comando no vs code
  
    sudo apt install python3.11 python3.11-venv python3.11-dev


  \
  \
  Para baixar as bibliotecas necessarias execute esse comando no terminal do VS code
  ```bash
    cd llms
    pip install python-telegram-bot tensorflow numpy pandas paho-mqtt ollama
  ```

### Passo 6: Instalar a Extensão PlatformIO no VS Code
Abra o Visual Studio Code.

> Clique no ícone de Extensões no menu lateral esquerdo (Ctrl + Shift + X ou Cmd + Shift + X).

> Pesquise por PlatformIO IDE e clique em Install.

> Aguarde a instalação concluir.

> Vá na extensão platform.io > Open Folder... e abra a pasta do projeto que você clonou.

### Passo 7: Configurar a Placa no platformio.ini
Localize o arquivo platformio.ini na raiz do projeto. Substitua o conteúdo do arquivo de acordo com a placa que você está utilizando:

🔹 Opção A: Para ESP32
> [env:esp32dev]

> platform = espressif32

> board = esp32dev

> framework = arduino

> monitor_speed = 115200


🔹 Opção B: Para ESP8266 (ex: NodeMCU)

> [env:nodemcuv2]

> platform = espressif8266

> board = nodemcuv2

> framework = arduino

> monitor_speed = 115200


#### Atenção: Salve o arquivo (Ctrl + S) após definir a placa correspondente.
### Passo 8: Conectar o Sensor à Placa
Com a placa desligada do computador, faça as conexões físicas dos pinos do sensor na ESP:

> VCC (Sensor) ➔ 3.3V ou 5V (ESP) (verifique a voltagem do seu sensor)

> GND (Sensor) ➔ GND (ESP)

> Sinal / Data (Sensor) ➔ Pino GPIO definido no código (ex: GPIO 4 / D2)



### Passo 9: Compilar e Carregar o Código na ESP

Conecte a placa ESP ao computador utilizando um cabo USB de dados.
#### Atenção 1:
Se caso estiver no windows e não conseguir conectar mostrando "the port is busy or doesn't exist".
Verifique DEVICE MANAGER,  se o cabo de dados nao estiver  como porta COM você deverá baixar o driver CP210x

##### Instalação do Driver:
 Baixar a versão CP210x Universal Windows Driver         
           
  [Download do driver CP210x — Silicon Labs](https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers?tab=downloads)
    

#### ⚠️ Atenção 2:
Antes de compilar, modifique o SSID e a senha da rede Wi-Fi no código-fonte de acordo com a rede disponível na sua região, caso contrário a placa não conseguirá se conectar à internet.

> Clique no ícone ✓ (Build) para compilar o código.

> Clique no ícone ➔ (Upload) para gravar o programa na placa.

> Clique no ícone de Tomada / Plugue (Serial Monitor) configurado para a taxa de 115200 baud para visualizar a inicialização e mensagens do sistema.


  
### Passo 10: Rodar os LLMS  

Abra um novo terminal e digite  esse comando:
   Windows:
    
    cd llms 
    python Filtro_telegram.py
    python Lstm.py  

  Ubuntu:
    
    cd llms 
    python3 Filtro_telegram.py
    python3 Lstm.py  


### Passo 11: Conectar ao Wi-Fi e Acessar a Interface Web
Certifique-se de que o seu computador/celular e a ESP estejam conectados na mesma rede Wi-Fi.

Acompanhe pelo Serial Monitor o endereço IP atribuído à placa (exemplo: 192.168.1.15).

Abra a página web hospedada acessando o link abaixo:

👉 [Clique aqui para acessar a Aplicação Web](https://marcosamorim22.github.io/IoTDeviceForFloodPrevention/)
