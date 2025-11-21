
import sys
import os

# Add backend directory to sys.path
sys.path.append(os.path.abspath("backend"))

from utils.config import get_application_configuration
import json

config = get_application_configuration()
video_models = config["models"]["video"]["enabled"]

for model in video_models:
    print(f"Model: {model['id']}")
    print(f"Capabilities: {json.dumps(model.get('capabilities', {}), indent=2)}")
    print("-" * 20)
