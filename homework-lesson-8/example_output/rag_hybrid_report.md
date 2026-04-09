## Summary
RAG (Retrieval-Augmented Generation) — це архітектурний патерн, де LLM під час інференсу спирається на зовнішні документи, отримані retrieval-модулем, щоб відповіді були «заземлені» (grounded) на реальних джерелах.

## Key Findings
### 1) Визначення та типова pipeline
Типова RAG-пайплайн-логіка: 
1) **Ingestion/очищення** → 2) **Chunking** (розбиття на фрагменти) → 3) **Indexing** (збереження: sparse-індекс для BM25 та/або dense-вектори) → 4) **Retrieval** (знаходження top-K кандидатів) → 5) **Reranking** (переранжування кандидатів більш точним моделем) → 6) **Generation** (LLM генерує відповідь з контекстом) → 7) **Citations/grounding** (вказування, з яких фрагментів взято твердження).

Локальні матеріали в цій сесії отримати не вдалося через збій доступу до локальної knowledge base (Qdrant недоступний), тому нижче визначення/пайплайн спираються на веб-джерела.

### 2) Основні підходи до retrieval у RAG
- **Sparse / lexical retrieval (BM25)**: добре працює на точних збігах термінів/формулювань; часто сильний baseline.
- **Dense / semantic retrieval (векторні ембедінги)**: краще ловить смислові відповідності та перефразування, але може пропускати точні числові/термінологічні збіги.
- **Hybrid retrieval (sparse + dense)**: комбінує сигнали, щоб підвищити **recall** (знайти більше релевантного) та зменшити «сліпі зони» кожного підходу.
- **Fusion**: способи об’єднання списків кандидатів (напр., **Reciprocal Rank Fusion, RRF** або комбінування score).
- **Reranking (двоступеневий підхід)**: переранжування top-N кандидатів крос-енкодером/LLM-ранкером для підвищення точності перед подачею в LLM.
- **Query expansion / query augmentation**: HyDE, multi-query тощо — перетворює короткий запит у більш «документоподібний» для покращення відповідності.

### 3) Чим hybrid search кращий за чистий semantic search
Ключова ідея: **BM25 (sparse) дає точність на лексичних збігах**, а **dense — покриває семантичні перефразування**. У результаті hybrid частіше знаходить правильні докази в top-K, а reranking далі підвищує precision.

Емпіричний приклад з сучасного benchmark’у:
- У роботі **“From BM25 to Corrective RAG …”** (arXiv: 2604.01733) автори системно порівнюють sparse/dense/hybrid та reranking на фінансових text+table документах і показують, що **двоступенева pipeline з hybrid retrieval + neural reranking** суттєво краща за single-stage методи; також **BM25 може обганяти dense** на фінансових документах (де важливі точні числові/термінологічні збіги).
- У звіті учасника **TREC RAG 2025** (NITATREC) також прямо зазначено, що **hybrid pipeline (BM25 + dense) з cross-encoder reranking** дає найкращі результати серед розглянутих підходів.

### 4) Тези з 2–3 web-джерел і узгодження з локальною логікою
> Примітка: локальні матеріали не вдалося прочитати через недоступність Qdrant, тож «узгодження» тут означає відповідність типовій RAG-архітектурі, яку описують веб-джерела.

1) **arXiv:2604.01733 (“From BM25 to Corrective RAG …”)**
   - Порівнює 10 retrieval стратегій (sparse/dense/hybrid, fusion, reranking, query expansion тощо).
   - Показує, що hybrid + reranking дає найкращий recall/ранжування, а BM25 може бути сильним baseline на фінансових даних.

2) **TREC RAG 2025 paper (NITATREC)**
   - Розглядає BM25, dense (DPR embeddings) та hybrid (sparse+dense) з cross-encoder reranking.
   - Робить висновок про важливість комбінування lexical і semantic сигналів для RAG.

3) **TREC 2025 proceedings (огляд/збірка робіт)**
   - Підтверджує, що в сучасних системах TREC RAG широко застосовують **hybrid retrieval** та **reranking**, а також query augmentation.

### 5) Практичні рекомендації для production: як вибирати hybrid
- **Якщо в домені є точні терміни/числа/ID** (фінанси, юридичні документи, технічні специфікації) — hybrid майже напевно дасть виграш над pure semantic.
- **Завжди робіть двоступеневий підхід**: 
  - stage-1: швидкий retrieval (BM25 + dense) для recall,
  - stage-2: reranking (cross-encoder/LLM-ranker) для precision.
- **Оцініть на вашому наборі**: вимірюйте retrieval metrics (Recall@K, MRR, nDCG) і end-to-end (faithfulness/answer quality). У TREC/benchmark’ах саме retrieval якість сильно впливає на генерацію.
- **Fusion strategy**: почніть з RRF або простого score-combining, потім оптимізуйте під ваші розподіли запитів.
- **Query augmentation** (HyDE/multi-query) — корисне не завжди; на точних числових запитах може давати обмежений ефект (це відзначається в benchmark’ах для фінансових задач).

## Sources
- https://arxiv.org/html/2604.01733v1
- https://trec.nist.gov/pubs/trec34/papers/NIT%20Agartala.rag.pdf
- https://pages.nist.gov/trec-browser/trec34/rag/proceedings/