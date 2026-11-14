"""One-time conversion of vjsyong/xlm-roberta-dementia_detection from TensorFlow (tf_model.h5) to PyTorch.

Reads the Keras h5 with h5py (no TensorFlow needed), maps the weights to XLMRobertaForSequenceClassification and
writes model.safetensors next to them. Download first (weights stay out of git, models/ is ignored):
  .venv/bin/python -c "from huggingface_hub import snapshot_download as s; s('vjsyong/xlm-roberta-dementia_detection', local_dir='models/research-classifier/vjsyong-xlm-roberta-dementia_detection')"
Run: PYTHONPATH=. .venv/bin/python scripts/convert_research_classifier.py
"""
import sys

import h5py
import torch
from transformers import XLMRobertaConfig, XLMRobertaForSequenceClassification

from es_core.research_classifier import MODEL_DIR

d = MODEL_DIR
cfg = XLMRobertaConfig.from_pretrained(str(d))
model = XLMRobertaForSequenceClassification(cfg)
f = h5py.File(d / "tf_model.h5")
tf = {}
f.visititems(lambda n, o: tf.__setitem__(n.split("tfxlm_roberta_for_sequence_classification/", 1)[1].removesuffix(":0"),
                                         torch.tensor(o[()])) if isinstance(o, h5py.Dataset) else None)
sd = {}
R = "roberta/"
sd["roberta.embeddings.word_embeddings.weight"] = tf[R + "embeddings/word_embeddings/weight"]
sd["roberta.embeddings.position_embeddings.weight"] = tf[R + "embeddings/position_embeddings/embeddings"]
sd["roberta.embeddings.token_type_embeddings.weight"] = tf[R + "embeddings/token_type_embeddings/embeddings"]
sd["roberta.embeddings.LayerNorm.weight"] = tf[R + "embeddings/LayerNorm/gamma"]
sd["roberta.embeddings.LayerNorm.bias"] = tf[R + "embeddings/LayerNorm/beta"]
for i in range(cfg.num_hidden_layers):
    p, t = f"roberta.encoder.layer.{i}.", R + f"encoder/layer_._{i}/"
    for name in ("query", "key", "value"):
        sd[p + f"attention.self.{name}.weight"] = tf[t + f"attention/self/{name}/kernel"].T
        sd[p + f"attention.self.{name}.bias"] = tf[t + f"attention/self/{name}/bias"]
    sd[p + "attention.output.dense.weight"] = tf[t + "attention/output/dense/kernel"].T
    sd[p + "attention.output.dense.bias"] = tf[t + "attention/output/dense/bias"]
    sd[p + "attention.output.LayerNorm.weight"] = tf[t + "attention/output/LayerNorm/gamma"]
    sd[p + "attention.output.LayerNorm.bias"] = tf[t + "attention/output/LayerNorm/beta"]
    sd[p + "intermediate.dense.weight"] = tf[t + "intermediate/dense/kernel"].T
    sd[p + "intermediate.dense.bias"] = tf[t + "intermediate/dense/bias"]
    sd[p + "output.dense.weight"] = tf[t + "output/dense/kernel"].T
    sd[p + "output.dense.bias"] = tf[t + "output/dense/bias"]
    sd[p + "output.LayerNorm.weight"] = tf[t + "output/LayerNorm/gamma"]
    sd[p + "output.LayerNorm.bias"] = tf[t + "output/LayerNorm/beta"]
sd["classifier.dense.weight"] = tf["classifier/dense/kernel"].T
sd["classifier.dense.bias"] = tf["classifier/dense/bias"]
sd["classifier.out_proj.weight"] = tf["classifier/out_proj/kernel"].T
sd["classifier.out_proj.bias"] = tf["classifier/out_proj/bias"]
sd = {k: v.contiguous() for k, v in sd.items()}
missing, unexpected = model.load_state_dict(sd, strict=False)
missing = [m for m in missing if "position_ids" not in m]
if missing or unexpected:
    sys.exit(f"mapping problem: missing={missing} unexpected={unexpected}")
model.save_pretrained(str(d), safe_serialization=True)
print("converted ->", d / "model.safetensors")
