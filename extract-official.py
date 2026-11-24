# 从教育部《全国大学英语四、六级考试大纲（2016年修订版）》PDF 提取词表。
# 词表在 PDF 第 21-149 页（0-index 20..148），带 ★ 的词目为六级新增，
# 不带 ★ 的为四级。同根词排在从属列（x≈168/251），继承主词目级别。
# 输出 raw/official-cet4.txt 与 raw/official-cet6.txt（纯词形，供 build-books.js 复用释义）。
#
# 依赖：pip install pymupdf
# 运行：python extract-official.py
import os
import re
import sys

try:
    import pymupdf as fitz
except ImportError:
    sys.exit('需要 pymupdf：pip install pymupdf')

PDF = os.path.join(os.environ.get('TEMP', '/tmp'), 'cet2016.pdf')
if not os.path.exists(PDF):
    PDF = os.path.join('raw', 'cet2016.pdf')
if not os.path.exists(PDF):
    sys.exit('找不到 cet2016.pdf，请放到 raw/ 或系统临时目录')

doc = fitz.open(PDF)

# PDF 用全角字符，先做 NFKC 之外的定点归一：★ 保留，其余转半角便于判断。
FULL2HALF = str.maketrans('０１２３４５６７８９Ｇ／（）', '0123456789G/()')

def norm_form(s):
    s = s.replace('\u3000', ' ').strip()
    if not s or s == '★':
        return None
    # ★ 单独占据主词目行首，判级后要从词形里剥掉
    s = s.lstrip('★').strip()
    # 页眉、页码、词表单字、同形异义序号
    if re.search(r'[\u4e00-\u9fff]', s):
        return None
    if re.match(r'^\d+$', s):
        return None
    # Ｇ 是全角 G，用于英美变体分隔 center/Ｇtre → center/-tre
    s = s.translate(FULL2HALF).replace('G', '-').replace('／', '/')
    return s.strip()

entries = []  # (star, [forms]) —— 一条词目含主词与同根词
for page_no in range(20, 149):
    page = doc[page_no]
    for block in page.get_text('dict')['blocks']:
        for line in block.get('lines', []):
            txt = ''.join(sp['text'] for sp in line['spans']).strip()
            form = norm_form(txt)
            if form is None:
                continue
            y = (line['bbox'][1] + line['bbox'][3]) / 2
            if not (95 <= y <= 735):
                continue
            star = txt.startswith('★')
            # 同根词列起于 x≈168；主词列在 x≈81
            is_sub = line['bbox'][0] >= 160
            parts = [p for p in re.split(r'[\s]+', form) if p]
            if is_sub and entries:
                entries[-1][1].extend(parts)
            else:
                entries.append((star, parts))

# 规范化每个词形：去斜杠变体只留首个拼写，去上标数字，统一小写。
def clean_word(f):
    f = f.split('/')[0].strip()
    f = re.sub(r'\d+$', '', f)
    f = f.replace('．', '.').replace('.', '')
    f = f.strip("- '\u2019")
    return f.lower()

cet4, cet6 = [], []
seen = set()
for star, forms in entries:
    bucket = cet6 if star else cet4
    for f in forms:
        w = clean_word(f)
        if not w or not re.match(r"^[a-z][a-z'-]*$", w) or w in seen:
            continue
        seen.add(w)
        bucket.append(w)

os.makedirs('raw', exist_ok=True)
with open('raw/official-cet4.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(cet4) + '\n')
with open('raw/official-cet6.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(cet6) + '\n')

print('PDF 词条行: %d' % len(entries))
print('官方四级词形: %d  → raw/official-cet4.txt' % len(cet4))
print('官方六级新增词形: %d  → raw/official-cet6.txt' % len(cet6))
print('合计: %d（官方口径 7969，差异来自变体/上标去重）' % (len(cet4) + len(cet6)))
