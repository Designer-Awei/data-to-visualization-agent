import random
import pandas as pd

# 随机生成学生姓名
first_names = ["张", "李", "王", "赵", "陈", "刘", "杨", "黄", "吴", "周"]
last_names = ["伟", "芳", "娜", "敏", "静", "强", "磊", "军", "洋", "艳"]
names = [random.choice(first_names) + random.choice(last_names) for _ in range(100)]

# 随机生成学号
student_ids = [f"2025{str(i).zfill(4)}" for i in range(1, 101)]

# 随机生成成绩 (语文、数学、英语、物理、化学、生物)
scores = []
for _ in range(100):
    chinese = random.randint(60, 100)
    math = random.randint(60, 100)
    english = random.randint(60, 100)
    physics = random.randint(60, 100)
    chemistry = random.randint(60, 100)
    biology = random.randint(60, 100)
    scores.append([chinese, math, english, physics, chemistry, biology])

# 创建数据框
data = {
    "序号": range(1, 101),
    "姓名": names,
    "学号": student_ids,
    "语文": [score[0] for score in scores],
    "数学": [score[1] for score in scores],
    "英语": [score[2] for score in scores],
    "物理": [score[3] for score in scores],
    "化学": [score[4] for score in scores],
    "生物": [score[5] for score in scores],
}

df = pd.DataFrame(data)

# 导出为Excel文件
df.to_excel("高三1班学生期末考试成绩.xlsx", index=False)

print("Excel文件已生成：'高三1班学生期末考试成绩.xlsx'") 