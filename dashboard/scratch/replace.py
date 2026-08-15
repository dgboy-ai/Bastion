import os

file_path = "c:/projects/bastion/dashboard/src/app/agent/Content.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    data = f.read()

# Replace fonts
data = data.replace('fontSize: "9px"', 'fontSize: "11px"')
data = data.replace('fontSize: "10px"', 'fontSize: "13px"')
data = data.replace('fontSize: "11px"', 'fontSize: "13px"')
data = data.replace('fontSize: "12px"', 'fontSize: "14px"')
data = data.replace('fontSize: "13px"', 'fontSize: "15px"')

# Replace weights
data = data.replace('fontWeight: 600', 'fontWeight: 700')

with open(file_path, "w", encoding="utf-8") as f:
    f.write(data)

print("Replaced fonts successfully!")
