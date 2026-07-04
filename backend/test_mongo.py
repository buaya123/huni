from pymongo import MongoClient

uri = "mongodb://huniadmin:uW7BU4gNWmwLNhTo@ac-hpqabnc-shard-00-00.vznqds6.mongodb.net:27017,ac-hpqabnc-shard-00-01.vznqds6.mongodb.net:27017,ac-hpqabnc-shard-00-02.vznqds6.mongodb.net:27017/?ssl=true&replicaSet=atlas-fhposf-shard-0&authSource=admin&retryWrites=true&w=majority&appName=huni-prod"

client = MongoClient(uri, serverSelectionTimeoutMS=5000)

try:
    print(client.admin.command("ping"))
    print("✅ Connected successfully!")
except Exception as e:
    print("❌ Connection failed:")
    print(e)