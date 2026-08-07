import os
from dotenv import load_dotenv

def main():
    print("--- Directly reading os.environ before load_dotenv ---")
    print(f"BASTION_CONN: {os.environ.get('BASTION_CONN')}")
    
    print("\n--- Running load_dotenv('.env.local') ---")
    load_dotenv(".env.local", override=True)
    print(f"BASTION_CONN: {os.environ.get('BASTION_CONN')}")
    
    # Import config and check get_settings
    print("\n--- Importing bastion.config ---")
    from bastion.config import get_settings
    settings = get_settings()
    print(f"Settings connection_string: {settings.connection_string}")
    print(f"Settings mock: {settings.mock}")

if __name__ == "__main__":
    main()
