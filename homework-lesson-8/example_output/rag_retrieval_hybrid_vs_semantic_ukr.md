# RAG, retrieval підходи та чому hybrid часто кращий за pure semantic

## 1) Що таке RAG (Retrieval-Augmented Generation)
**RAG** — це підхід, у якому LLM під час відповіді **не тільки генерує текст**, а й **підтягує релевантний контекст із зовнішніх документів** (через retrieval) та використовує його як “grounding” для відповіді.

**Базовий pipeline (retrieve-and-generate):**
1. **Chunking** документів (розбиття на чанки).
2. **Індексація**: створення embeddings (dense) та/або індекс для full-text/keyword (lexical).
3. **Retrieval** за запитом користувача (vector / BM25 / hybrid).
4. (Опційно) **Query rewriting** (варіації запиту) та/або **re-ranking** (друга стадія точнішого ранжування).
5. **Generation**: LLM генерує відповідь, використовуючи retrieved чанки як контекст.

## 2) Основні підходи до retrieval у RAG
Найчастіше зустрічаються такі категорії:

- **Lexical / sparse retrieval (BM25, full-text)**
  - Сильний для **точних збігів** термінів, імен, кодів, дат.
- **Dense / semantic retrieval (vector search)**
  - Сильний для **парафразів** і семантично близьких формулювань.
- **Hybrid retrieval (sparse + dense)**
  - Паралельно робить keyword/BM25 і vector search, а потім **ф’юзить** результати (часто через **RRF**).
- **Fusion (RRF та ін.)**
  - Об’єднання кількох ranked списків у один порядок.
- **Re-ranking (second stage / L2 ranking)**
  - Після швидкого retrieval кандидати переранжуються більш точним ranker’ом (часто cross-encoder/LLM-based).
- **Query rewriting / multi-query / query expansion**
  - Створення варіацій запиту для підвищення recall.

## 3) Чим hybrid search кращий за pure semantic search
### Ключова причина
**Pure semantic (dense-only)** може пропускати **exact-match** факти (імена, числа, специфічні терміни), тоді як **lexical/BM25** добре ловить такі збіги. **Hybrid** поєднує обидва типи сигналів, а **re-ranking** підсилює precision.

### Практичний “коли виграє”
- **Exact match / числові та табличні запити**: hybrid має кращі шанси знайти правильні чанки.
- **Гетерогенні документи (text + tables)**: часто потрібні і лексичні “якорі”, і семантичне узгодження.

### Емпіричний сигнал з benchmark-джерела
У web-джерелі (arXiv) описано двоступеневий підхід **hybrid retrieval + neural reranking** для фінансового QA (text+tables) з високими retrieval-метриками (зокрема **Recall@5** та **MRR@3**), і зазначено, що він обганяє single-stage методи в їхньому setup.

### Коли hybrid може не дати виграш
- Якщо домен і запити майже завжди є семантичними парафразами без потреби в точних лексичних збігах.
- Якщо pipeline “вузьке місце” не в retrieval modality, а в **chunking**, top-k, або слабкому reranker’і.

## 4) Порівняння локальних матеріалів vs web-джерела (коротко)
- **Локальна KB**: дає базове визначення RAG і типову схему retrieve → augment prompt → generate; підкреслює, що vector-only може пропускати важливі факти.
- **Web (Microsoft/NVIDIA)**: додає інженерні деталі:
  - hybrid = keyword/full-text + vector + fusion (RRF),
  - reranking як **second stage** після швидкого retrieval.
- **Web (benchmark)**: показує, що **hybrid + neural reranking** може давати вимірюваний виграш на конкретних доменах.

## 5) Джерела (2–3 web)
- Microsoft (Azure / RAG retrieval techniques): https://www.microsoft.com/en-us/microsoft-cloud/blog/2025/02/04/common-retrieval-augmented-generation-rag-techniques-explained/
- NVIDIA (re-ranking у RAG): https://developer.nvidia.com/blog/enhancing-rag-pipelines-with-re-ranking/
- arXiv (benchmark для hybrid + neural reranking): https://arxiv.org/html/2604.01733v1

---

## Примітка про обмеження
У цьому звіті частина “актуальності” та точних формулювань з web-джерел відтворена за доступним прочитаним вмістом; для 100% точного цитування (дата/назва/точний контекст метрик) може знадобитися додаткове read_url на abs/PDF-метадані.