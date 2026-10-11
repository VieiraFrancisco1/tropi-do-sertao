from pathlib import Path
import subprocess
import sys

root = Path(__file__).parent
subprocess.run(["node", str(root / "scripts/build.mjs"), "--mode", "demo", *sys.argv[1:]], check=True)
