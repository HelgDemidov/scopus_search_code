import re

with open('frontend/src/components/theme/StarFieldCanvas.tsx', 'r') as f:
    lines = f.readlines()

out = []
skip = False
for line in lines:
    if line.strip().startswith('//') and ('раунд' in line.lower() or 'правка' in line.lower() or 'docs/' in line.lower() or 'тз' in line.lower() or 'пользовател' in line.lower()):
        continue
    # also remove any very long contiguous comment blocks
    out.append(line)

with open('frontend/src/components/theme/StarFieldCanvas.tsx', 'w') as f:
    f.writelines(out)
