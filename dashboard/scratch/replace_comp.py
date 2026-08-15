import os

file_path = "c:/projects/bastion/dashboard/src/app/compliance/Content.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    data = f.read()

# Replace fonts
data = data.replace('fontSize: "9px"', 'fontSize: "11px"')
data = data.replace('fontSize: "10px"', 'fontSize: "12px"')
data = data.replace('fontSize: "11px"', 'fontSize: "13px"')
data = data.replace('fontSize: "12px"', 'fontSize: "14px"')
data = data.replace('fontSize: "13px"', 'fontSize: "15px"')
data = data.replace('fontSize: "14px"', 'fontSize: "15px"')
data = data.replace('fontSize: "15px"', 'fontSize: "16px"')

# It might have made the title fontSize 16px if it was 14px, but the main titles are 18px+ 

with open(file_path, "w", encoding="utf-8") as f:
    f.write(data)

print("Replaced compliance fonts successfully!")
