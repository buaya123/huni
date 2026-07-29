from pathlib import Path
import json
import frontmatter

BASE_DIR = Path(__file__).resolve().parent.parent

LEGAL_DIR = BASE_DIR / "legal"

VERSIONS_FILE = LEGAL_DIR / "versions.json"


class LegalService:

    @staticmethod
    def _versions():

        with open(VERSIONS_FILE, encoding="utf-8") as f:
            return json.load(f)

    @classmethod
    def list_documents(cls):

        versions = cls._versions()

        docs = []

        for doc_id, version in versions.items():

            file = LEGAL_DIR / doc_id / f"{version}.md"

            post = frontmatter.load(file)

            docs.append(
                {
                    "id": doc_id,
                    "title": post.metadata.get("title", doc_id.title()),
                    "version": version,
                }
            )

        return docs

    @classmethod
    def get_document(cls, document: str):

        versions = cls._versions()

        if document not in versions:
            return None

        version = versions[document]

        file = LEGAL_DIR / document / f"{version}.md"

        if not file.exists():
            return None

        post = frontmatter.load(file)

        return {
            "id": document,
            "title": post.metadata.get("title"),
            "version": post.metadata.get("version"),
            "effective": post.metadata.get("effective"),
            "last_updated": post.metadata.get("last_updated"),
            "content": post.content,
        }