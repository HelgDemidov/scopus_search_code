import os
import asyncio
import httpx
from colorama import Fore, Style, init

# Инициализация библиотеки для красивого вывода в консоль
init(autoreset=True)

# ----------------- НАСТРОЙКИ -----------------
# Публичный URL на Railway
BASE_URL = "https://scopus-search-code.up.railway.app"

# Токен SWAGGER
# Получаем токен из переменных окружения (если есть) или просим вставить вручную
JWT_TOKEN = os.getenv("SEEDER_JWT_TOKEN", "PASTE_YOUR_JWT_TOKEN_HERE") 

# Количество статей за 1 запрос (от 1 до 25)
ARTICLES_PER_QUERY = 25 

# Пауза между запросами (в секундах) - не рекмоендутеся делать меньше 1, чтобы не положить Railway
DELAY_BETWEEN_REQUESTS = 2.0 

# Наши 100 уникальных фраз
KEYWORDS = [
    "generative pretrained transformer", "large language model training", "instruction tuned language models",
    "reinforcement learning from human feedback", "in context learning mechanisms", "retrieval augmented generation system",
    "multimodal transformer architecture", "parameter efficient fine tuning", "low rank adaptation methods",
    "prompt engineering strategies", "chain of thought prompting", "hallucination mitigation in llm",
    "factual consistency llm outputs", "safety alignment for llm", "jailbreak detection techniques",
    "synthetic data generation for llm", "continual pretraining of transformers", "curriculum learning for llm",
    "tool using language models", "code generation with transformers",
    
    "generative adversarial network genomics", "gan for genomic data augmentation", "gan based variant calling",
    "gan for gene expression synthesis", "generative adversarial network bioinformatics", "single cell transcriptomics gan",
    "gan for dna sequence generation", "gan for rna sequence analysis", "protein structure generation gan",
    "multimodal gan for biomedical data", "adversarial learning in genomics", "privacy preserving gan for health data",
    "conditional gan for omics integration", "anomaly detection in genomics using gan", "adversarial training for genomic classifiers",

    "neuromorphic computing for artificial intelligence", "neuromorphic architecture for spiking networks",
    "spiking neural network inference", "event driven neuromorphic processing", "memristor based neuromorphic computing",
    "brain inspired neuromorphic hardware", "analog neuromorphic accelerator", "low power neuromorphic inference",
    "edge intelligence with neuromorphic chips", "reservoir computing on neuromorphic hardware", "asynchronous neuromorphic circuits",
    "on chip learning in neuromorphic systems", "neuromorphic sensor fusion", "hybrid neuromorphic deep learning",
    "spiking transformer architecture",

    "hardware accelerator for large language models", "tensor processing unit architecture", "gpu tensor core optimization",
    "ai accelerator for transformer inference", "systolic array for matrix multiplication", "specialized inference engine for llm",
    "model quantization for hardware efficiency", "int8 inference for transformers", "mixed precision inference techniques",
    "sparsity exploitation in neural networks", "structured pruning for faster inference", "hardware aware neural architecture search",
    "chiplet based ai accelerator", "near memory computing for ai", "in memory computing for neural networks",

    "weight hardcoding in neural accelerators", "weight stationary dataflow architecture", "compute in memory crossbar array",
    "analog weight storage for inference", "resistive crossbar neural accelerator", "fixed function neural network accelerator",
    "compiled neural network to hardware", "logic in memory accelerator design", "on chip interconnect optimization for ai",
    "topology aware mapping of neural networks", "hardware software co design for llm", "pipeline parallelism in transformer inference",
    "memory bandwidth optimization for ai chips", "hardware security for ai accelerators", "fault tolerance in neural hardware",

    "automated machine learning pipeline", "self improving machine learning system", "closed loop model improvement",
    "online learning in production systems", "active learning feedback loop", "gradient based architecture search",
    "meta learning for model adaptation", "reinforcement learning based hyperparameter tuning",
    "continuous deployment of machine learning models", "mlops pipeline automation", "monitoring drift in ml deployments",
    "feedback loop for recommendation systems", "self supervised pretraining and finetuning", "multi agent learning system optimization",
    "human in the loop model refinement", "dynamic dataset curation with ml", "automated label correction using models",
    "bandit based model selection", "iterative retraining with user feedback", "autonomous machine learning lifecycle"
]

async def seed_database():
    print(f"{Fore.CYAN}Начинаем наполнение базы данных...")
    print(f"URL: {BASE_URL}")
    print(f"Всего ключевых фраз: {len(KEYWORDS)}\n")

    headers = {
        "Authorization": f"Bearer {JWT_TOKEN}",
        "Accept": "application/json"
    }

    # Используем асинхронный клиент httpx
    async with httpx.AsyncClient(timeout=30.0) as client:
        for i, keyword in enumerate(KEYWORDS, 1):
            print(f"[{i}/{len(KEYWORDS)}] Запрос по фразе: {Fore.YELLOW}'{keyword}'{Style.RESET_ALL}...", end=" ")
            
            try:
                # Делаем GET запрос к нашему API на Railway
                response = await client.get(
                    f"{BASE_URL}/articles/find",
                    headers=headers,
                    params={"keyword": keyword, "count": ARTICLES_PER_QUERY}
                )
                
                # Если токен протух или Railway лежит
                if response.status_code == 401:
                    print(f"{Fore.RED}Ошибка 401: Неверный или просроченный JWT токен. Обнови JWT_TOKEN.")
                    break
                elif response.status_code != 200:
                    print(f"{Fore.RED}Ошибка {response.status_code}: {response.text}")
                    continue

                # Получаем ответ в виде JSON (список сохраненных статей)
                data = response.json()
                print(f"{Fore.GREEN}Успешно! Сохранено новых: ~{len(data)} шт.")

            except httpx.RequestError as e:
                print(f"{Fore.RED}Сетевая ошибка при запросе: {e}")
            except Exception as e:
                print(f"{Fore.RED}Непредвиденная ошибка: {e}")

            # Обязательная пауза, чтобы не дидосить Railway и Scopus
            await asyncio.sleep(DELAY_BETWEEN_REQUESTS)
            
    print(f"\n{Fore.CYAN}Процесс наполнения завершен!")
    print(f"Зайди в логи Railway, чтобы посмотреть остаток лимита: X-RateLimit-Remaining")

if __name__ == "__main__":
    asyncio.run(seed_database())
