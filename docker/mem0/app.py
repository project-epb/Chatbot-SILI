import os

from dotenv import load_dotenv
from flask import Blueprint, Flask, jsonify, request
from mem0 import Memory

load_dotenv()

app = Flask(__name__)
app.url_map.strict_slashes = False

api = Blueprint("api", __name__, url_prefix="/v1")

config = {
    "vector_store": {
        "provider": "redis",
        "config": {
            "collection_name": "sili_mem0",
            "redis_url": os.environ.get("REDIS_URL", "redis://localhost:6379"),
            "embedding_model_dims": 1536,
        },
    },
    "llm": {
        "provider": os.environ.get("MEM0_LLM_PROVIDER", "openai"),
        "config": {
            "api_key": os.environ.get("OPENAI_API_KEY"),
            "model": os.environ.get("MEM0_MODEL", os.environ.get("OPENAI_MODEL", "gpt-4o-mini")),
            "openai_base_url": os.environ.get("OPENAI_API_BASE", "https://api.openai.com/v1"),
        },
    },
    "embedder": {
        "provider": "openai",
        "config": {
            "api_key": os.environ.get("OPENAI_API_KEY"),
            "model": os.environ.get("MEM0_EMBEDDER_MODEL", "text-embedding-v3"),
            "openai_base_url": os.environ.get("OPENAI_API_BASE", "https://api.openai.com/v1"),
        },
    }
}

print('mem0 config:', config)

memory = Memory.from_config(config)

@api.route("/")
def index():
    return jsonify({"message": "Welcome to Mem0!", "version": memory.version})

@api.route("/memories", methods=["POST"])
def add_memories():
    try:
        body = request.get_json()
        return memory.add(
            body["messages"],
            user_id=body.get("user_id"),
            agent_id=body.get("agent_id"),
            run_id=body.get("run_id"),
            metadata=body.get("metadata"),
            filters=body.get("filters"),
            prompt=body.get("prompt"),
        )
    except Exception as e:
        return jsonify({"message": str(e)}), 400


@api.route("/memories/<memory_id>", methods=["PUT"])
def update_memory(memory_id):
    try:
        existing_memory = memory.get(memory_id)
        if not existing_memory:
            return jsonify({"message": "Memory not found!"}), 400
        body = request.get_json()
        return memory.update(memory_id, data=body["data"])
    except Exception as e:
        return jsonify({"message": str(e)}), 400


@api.route("/memories/search", methods=["POST"])
def search_memories():
    try:
        body = request.get_json()
        return memory.search(
            body["query"],
            user_id=body.get("user_id"),
            agent_id=body.get("agent_id"),
            run_id=body.get("run_id"),
            limit=body.get("limit", 100),
            filters=body.get("filters"),
        )
    except Exception as e:
        return jsonify({"message": str(e)}), 400


@api.route("/memories", methods=["GET"])
def get_memories():
    try:
        return memory.get_all(
            user_id=request.args.get("user_id"),
            agent_id=request.args.get("agent_id"),
            run_id=request.args.get("run_id"),
            limit=request.args.get("limit", 100),
        )
    except Exception as e:
        return jsonify({"message": str(e)}), 400


@api.route("/memories/<memory_id>/history", methods=["GET"])
def get_memory_history(memory_id):
    try:
        return memory.history(memory_id)
    except Exception as e:
        return jsonify({"message": str(e)}), 400


app.register_blueprint(api)