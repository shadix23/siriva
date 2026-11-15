"""Export the cortex for the landing brain player (BrainPlayer) as two nested levels of detail.

Run: .venv-mac/bin/python viz/export_mesh_fs6.py [--blend 0.35]
Writes es/web/public/brain/cortex/{meta.json, fs6.bin, ico7.bin}.

Idea. TRIBE v2 predictions live on fsaverage5 (ico5, 10242 vertices per hemisphere). fsaverage meshes are nested
icosahedra: every finer level adds one vertex in the middle of every edge of the previous level. So the client
only needs the fs5 triangles; it subdivides them itself (fs5 -> fs6 -> ico7) with a fixed rule, and this script
emits, in exactly the same vertex order, what cannot be derived:
  * positions as integer deltas from the parent-edge midpoint (small numbers, compress well),
  * a light/dark tone from sulc + curv (gyri light, sulci dark) and a baked ambient occlusion per vertex.
The geometry is the high-resolution fsaverage (ico7, 163842 vertices per hemisphere) for every level, so the
fs6 level (phones, first frame) is an exact subset of ico7 (desktop upgrade).

Subdivision rule (mirrored in BrainPlayer.tsx, must stay identical):
  edges are numbered by first encounter, face by face, edges (a,b), (b,c), (c,a) of face (a,b,c), key (min,max);
  new vertex id = nv + edge number; face (a,b,c) -> (a,ab,ca) (ab,b,bc) (ca,bc,c) (ab,bc,ca).
Vertex order: 0..20483 = fs5 (left 0..10241, right 10242..20483), then fs6 new vertices, then ico7 new ones.

fs6.bin  faces5 uint16[40960*3] | q5 int16[20484*3] | d6 int8|int16[61440*3] | tone uint8[81924] | ao uint8[81924]
ico7.bin d7 int8|int16[245760*3] | tone uint8[327684] | ao uint8[327684]
q = round((p - center) / step); new vertex q = ((q_a + q_b) >> 1) + d.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from nilearn import datasets, surface
from scipy import sparse

R = Path(__file__).resolve().parents[1]
OUT = R.parent / "web" / "public" / "brain" / "cortex"
N5, N6, N7 = 10242, 40962, 163842
STEP = 0.02  # mm per quantisation unit (a pixel of the player is about 0.3 mm)


def edge_table(faces):
    """Unique edges in first-encounter order + per-face edge numbers (the client's rule)."""
    seen, ea, eb = {}, [], []
    fe = np.empty(faces.shape, np.int64)
    for f, (a, b, c) in enumerate(faces.tolist()):
        for k, (u, w) in enumerate(((a, b), (b, c), (c, a))):
            key = (u, w) if u < w else (w, u)
            e = seen.get(key)
            if e is None:
                e = seen[key] = len(ea)
                ea.append(key[0])
                eb.append(key[1])
            fe[f, k] = e
    return np.array(ea), np.array(eb), fe


def subdivide(faces, nv):
    ea, eb, fe = edge_table(faces)
    a, b, c = faces[:, 0], faces[:, 1], faces[:, 2]
    ab, bc, ca = nv + fe[:, 0], nv + fe[:, 1], nv + fe[:, 2]
    out = np.stack([a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca], 1).reshape(-1, 3)
    return out, ea, eb


def fs_midpoints(faces, n_old):
    """FreeSurfer numbering: dict (old_a, old_b) -> new vertex, for vertices >= n_old of one hemisphere."""
    e = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    e = np.concatenate([e, e[:, ::-1]])
    e = np.unique(e[(e[:, 0] >= n_old) & (e[:, 1] < n_old)], axis=0)
    cnt = np.bincount(e[:, 0])[n_old:]
    assert (cnt == 2).all(), "not a nested icosahedron"
    e = e[np.argsort(e[:, 0], kind="stable")]
    par = e[:, 1].reshape(-1, 2)
    return {(int(min(p)), int(max(p))): n_old + i for i, p in enumerate(par)}


def normals(pos, faces):
    fn = np.cross(pos[faces[:, 1]] - pos[faces[:, 0]], pos[faces[:, 2]] - pos[faces[:, 0]])
    vn = np.zeros_like(pos)
    for k in range(3):
        np.add.at(vn, faces[:, k], fn)
    return vn / (np.linalg.norm(vn, axis=1, keepdims=True) + 1e-9)


def smoother(faces, n):
    i = np.concatenate([faces[:, 0], faces[:, 1], faces[:, 2], faces[:, 1], faces[:, 2], faces[:, 0]])
    j = np.concatenate([faces[:, 1], faces[:, 2], faces[:, 0], faces[:, 0], faces[:, 1], faces[:, 2]])
    A = sparse.csr_matrix((np.ones(len(i)), (i, j)), shape=(n, n))
    A.data[:] = 1
    d = np.asarray(A.sum(1)).ravel()
    return sparse.diags(1 / d) @ A


def smooth(S, x, k):
    for _ in range(k):
        x = S @ x
    return x


def robust01(x, lo=2, hi=98):
    a, b = np.percentile(x, [lo, hi])
    return np.clip((x - a) / (b - a), 0, 1)


def zone_anchors(P, nrm):
    """Label anchors on the left lateral view (fs5 left-hemisphere ids = client ids).
    Language: frontal part of the language mask (inferior frontal gyrus), away from the auditory label.
    Auditory: the most lateral, visible part of Heschl gyrus / planum temporale."""
    m = np.load(R / "mac" / "work" / "masks_v2.npz")
    lang = (m["word_access"] | m["phrase_building"])[:N5]
    des = datasets.fetch_atlas_surf_destrieux()
    names = [x.decode() if isinstance(x, bytes) else x for x in des["labels"]]
    aud_ids = [i for i, n in enumerate(names) if n in ("G_temp_sup-G_T_transv", "S_temporal_transverse", "G_temp_sup-Plan_tempo")]
    aud = np.isin(des["map_left"], aud_ids)
    pial5 = np.asarray(surface.load_surf_mesh(datasets.fetch_surf_fsaverage("fsaverage5")["pial_left"]).coordinates)
    lateral = nrm[:, 0] < -0.55

    def nearest(idx):
        c = P[idx].mean(0)
        return int(idx[np.argmin(((P[idx] - c) ** 2).sum(1))])

    lf = np.flatnonzero(lang & lateral & (pial5[:, 2] > 0) & (pial5[:, 1] > -10))
    ai = np.flatnonzero(aud & lateral)
    al = ai[P[ai, 0] <= np.percentile(P[ai, 0], 15)]
    return {"language": nearest(lf), "auditory": nearest(al)}


def main(blend):
    f5 = datasets.fetch_surf_fsaverage("fsaverage5")
    f6 = datasets.fetch_surf_fsaverage("fsaverage6")
    f7 = datasets.fetch_surf_fsaverage("fsaverage")
    for h in ("left", "right"):  # nesting check on the registration sphere
        s7 = np.asarray(surface.load_surf_mesh(f7[f"sphere_{h}"]).coordinates)
        s6 = np.asarray(surface.load_surf_mesh(f6[f"sphere_{h}"]).coordinates)
        assert np.abs(s6 - s7[:N6]).max() < 1e-3

    # ico7 display surface: pial blended toward inflated (readable, still real gyri)
    pos7, faces7, sulc7, curv7, mid6, mid7 = [], [], [], [], [], []
    for hi, h in enumerate(("left", "right")):
        pial = surface.load_surf_mesh(f7[f"pial_{h}"])
        p = np.asarray(pial.coordinates, np.float64)
        q = np.asarray(surface.load_surf_mesh(f7[f"infl_{h}"]).coordinates, np.float64)
        q = q - q.mean(0) + p.mean(0)
        pos7.append(p * (1 - blend) + q * blend)
        faces7.append(np.asarray(pial.faces, np.int64) + hi * N7)
        sulc7.append(np.asarray(surface.load_surf_data(f7[f"sulc_{h}"]), np.float64))
        curv7.append(np.asarray(surface.load_surf_data(f7[f"curv_{h}"]), np.float64))
        mid6.append(fs_midpoints(np.asarray(surface.load_surf_mesh(f6[f"pial_{h}"]).faces, np.int64), N5))
        mid7.append(fs_midpoints(np.asarray(pial.faces, np.int64), N6))
    P = np.concatenate(pos7)
    F7 = np.concatenate(faces7)
    sulc = np.concatenate(sulc7)
    curv = np.concatenate(curv7)
    n7 = len(P)

    # tone and ambient occlusion on the ico7 surface (FreeSurfer numbering)
    S = smoother(F7, n7)
    nrm = normals(P, F7)
    curv_s = smooth(S, curv, 1)
    tone = 0.52 * (1 - robust01(sulc)) + 0.48 * (1 - robust01(curv_s, 3, 97))
    cav = np.zeros(n7)
    for k, w in ((6, 0.4), (36, 0.6)):  # about 2 mm and 5 mm
        d = ((P - smooth(S, P, k)) * nrm).sum(1)
        cav += w * d / (np.percentile(np.abs(d), 90) + 1e-9)
    ao = np.clip(0.84 + 0.26 * cav, 0.36, 1.0)

    # client vertex order
    f5L = np.asarray(surface.load_surf_mesh(f5["pial_left"]).faces, np.int64)
    f5R = np.asarray(surface.load_surf_mesh(f5["pial_right"]).faces, np.int64)
    faces5 = np.concatenate([f5L, f5R + N5])
    faces6c, a6, b6 = subdivide(faces5, 2 * N5)
    a7, b7, _ = edge_table(faces6c)
    o7 = 2 * N5 + len(a6)
    print("client edges fs5", len(a6), "fs6", len(a7))

    hemi = np.empty(o7 + len(a7), np.int64)
    loc = np.empty_like(hemi)
    v5 = np.arange(2 * N5)
    hemi[: 2 * N5] = v5 >= N5
    loc[: 2 * N5] = v5 - N5 * (v5 >= N5)
    for base, (ea, eb), mids in ((2 * N5, (a6, b6), mid6), (o7, (a7, b7), mid7)):
        for k, (a, b) in enumerate(zip(ea.tolist(), eb.tolist())):
            h = int(hemi[a])
            la, lb = int(loc[a]), int(loc[b])
            hemi[base + k], loc[base + k] = h, mids[h][(min(la, lb), max(la, lb))]
    g = hemi * N7 + loc  # client id -> FreeSurfer ico7 global id
    assert len(np.unique(g)) == n7, "client order does not cover ico7"

    # check: the client subdivision reproduces the FreeSurfer ico7 triangles
    faces7c, _, _ = subdivide(faces6c, o7)
    a_ = np.unique(np.sort(g[faces7c], 1), axis=0)
    b_ = np.unique(np.sort(F7, 1), axis=0)
    assert a_.shape == b_.shape and (a_ == b_).all(), "triangles differ"
    print("subdivision check ok:", len(faces7c), "triangles")

    center = (P.min(0) + P.max(0)) / 2
    q = np.round((P[g] - center) / STEP).astype(np.int64)  # client order
    assert np.abs(q).max() < 32767
    d6 = q[2 * N5 : o7] - ((q[a6] + q[b6]) >> 1)
    d7 = q[o7:] - ((q[a7] + q[b7]) >> 1)
    d7t = np.int8 if np.abs(d7).max() < 128 else np.int16
    print("delta range fs6", int(np.abs(d6).max()), "ico7", int(np.abs(d7).max()), "->", d7t.__name__)
    tone_c = np.round(tone[g] * 255).astype(np.uint8)
    ao_c = np.round(ao[g] * 255).astype(np.uint8)

    def write(name, chunks):
        buf, meta = bytearray(), {}
        for key, arr in chunks:
            while len(buf) % 4:
                buf.append(0)
            meta[key] = {"offset": len(buf), "length": int(arr.size), "type": str(arr.dtype)}
            buf += np.ascontiguousarray(arr).tobytes()
        (OUT / name).write_bytes(bytes(buf))
        print(name, len(buf), "bytes")
        return meta

    OUT.mkdir(parents=True, exist_ok=True)
    meta = {
        "about": "fsaverage ico7 cortex (pial blended toward inflated), nested LOD, see es/tribe/viz/export_mesh_fs6.py",
        "blend_inflated": blend,
        "step_mm": STEP,
        "center": [round(float(v), 4) for v in center],
        "fs5_per_hemi": N5,
        "counts": {"fs5": 2 * N5, "fs6": int(o7), "ico7": int(n7), "faces5": int(len(faces5))},
        "anchors": zone_anchors(P[g[:N5]], nrm[g[:N5]]),
        "fs6": {"file": "fs6.bin"},
        "ico7": {"file": "ico7.bin"},
    }
    meta["fs6"]["chunks"] = write(
        "fs6.bin",
        [
            ("faces5", faces5.astype(np.uint16)),
            ("q5", q[: 2 * N5].astype(np.int16)),
            ("d6", d6.astype(np.int8 if np.abs(d6).max() < 128 else np.int16)),
            ("tone", tone_c[:o7]),
            ("ao", ao_c[:o7]),
        ],
    )
    meta["ico7"]["chunks"] = write("ico7.bin", [("d7", d7.astype(d7t)), ("tone", tone_c), ("ao", ao_c)])
    (OUT / "meta.json").write_text(json.dumps(meta, indent=1))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--blend", type=float, default=0.35, help="share of the inflated surface, 0 = pial")
    main(ap.parse_args().blend)
