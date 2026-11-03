"""Prompt matrix for the Avatar pool.

Every prompt is assembled from independent axes drawn with a seeded RNG, so a
(category, seed) pair always yields the same prompt. The goal is phone-camera,
candid, selfie-like images, never studio portraits. Faces are adults only.

The axis choices are kept in the raw manifest as `meta` so curation can report
the planned spread; they are never written to the packed pool.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Any

# --- Faces -----------------------------------------------------------------

# Adults only. The generator is never asked for minors and curation rejects
# anything the age estimator thinks is under 20.
AGE_PHRASES: dict[str, list[str]] = {
    "young-adult": ["in their early 20s", "in their mid 20s", "in their late 20s"],
    "adult": ["in their early 30s", "in their late 30s", "around 40"],
    "middle-aged": ["in their late 40s", "in their 50s", "around 55"],
    "senior": ["in their 60s", "in their 70s", "elderly"],
}
# Faces skew towards the ages that actually comment on short-form video.
AGE_WEIGHTS = {"young-adult": 0.45, "adult": 0.30, "middle-aged": 0.15, "senior": 0.10}

PRESENTATION_PHRASES: dict[str, list[str]] = {
    "masculine": ["man", "man", "guy"],
    "feminine": ["woman", "woman", "lady"],
}

# Descriptors are deliberately broad regional/ethnic groups; the pool index
# never stores them. Equal weights by design: the pool is for worldwide use.
ETHNICITY_PHRASES: list[str] = [
    "East Asian",
    "South Asian",
    "Southeast Asian",
    "Black",
    "West African",
    "White",
    "Eastern European",
    "Mediterranean",
    "Middle Eastern",
    "North African",
    "Latino",
    "Afro-Caribbean",
    "Indigenous American",
    "Pacific Islander",
    "mixed-race",
    "Central Asian",
]

SETTINGS: list[str] = [
    "in a parked car, seatbelt visible",
    "in a messy bedroom",
    "on a busy city street",
    "in a cafe by the window",
    "in a gym locker room",
    "in a bathroom mirror",
    "in a kitchen",
    "at the beach, wind in hair",
    "at a concert, crowd behind",
    "in an office cubicle",
    "on a bus",
    "on a hiking trail",
    "in a supermarket aisle",
    "in a dorm room with posters",
    "on a balcony at night",
    "in a parking lot",
    "at a kitchen table with a laptop",
    "in the back seat of a taxi",
    "in a hotel elevator",
    "at a festival with face glitter",
]

LIGHTING: list[str] = [
    "soft window light",
    "golden hour sunlight",
    "overcast daylight",
    "harsh direct phone flash",
    "neon signs lighting",
    "dim warm indoor light",
    "cold fluorescent light",
    "mixed street light at night",
    "bright midday sun with squinting",
    "screen glow in a dark room",
]

FRAMING: list[str] = [
    "close-up selfie held at arm's length",
    "high-angle selfie looking up at the camera",
    "candid mid-shot taken by a friend",
    "selfie slightly cropped at the forehead",
    "looking off to the side, not at the camera",
    "wide-angle front camera with slight lens distortion",
    "mirror selfie holding a phone",
    "slightly tilted low-quality snapshot",
    "head and shoulders, centred, phone camera",
]

EXPRESSION: list[str] = [
    "laughing",
    "neutral expression",
    "smirking",
    "mid-sentence, mouth slightly open",
    "big genuine smile",
    "tired, no makeup",
    "raised eyebrow",
    "serious",
    "pouting playfully",
    "eyes half closed, caught off guard",
]

EXTRAS: list[str] = [
    "",
    "",
    "",
    "wearing glasses",
    "wearing sunglasses",
    "wearing a cap",
    "wearing a beanie",
    "wearing over-ear headphones",
    "wearing a hijab",
    "with a beard",
    "with braids",
    "with dyed hair",
    "with a buzz cut",
    "with curly hair",
    "with a nose ring",
    "with freckles",
    "with a hoodie up",
    "with earbuds in",
    "with a face mask pulled under the chin",
    "with a small tattoo on the neck",
]

CAMERA: list[str] = [
    "smartphone photo",
    "iPhone front camera photo",
    "low-light phone photo with slight grain",
    "casual snapshot, slight motion blur",
    "compressed social media photo",
    "candid phone photo, JPEG artefacts",
]

FACE_NEGATIVE = (
    "studio portrait, professional headshot, ring light, photoshoot, airbrushed, "
    "3d render, cgi, illustration, painting, text, watermark, logo, extra fingers, "
    "deformed, multiple people, child, kid, teenager, nudity"
)

# --- Non-face --------------------------------------------------------------

NON_FACE_SUBJECTS: dict[str, list[str]] = {
    "pet": [
        "a golden retriever looking at the camera",
        "a black cat lying on a sofa",
        "a tabby cat close-up, slightly out of focus",
        "a french bulldog with its tongue out",
        "a small mixed-breed dog in a car",
        "a white fluffy cat on a windowsill",
        "a husky in the snow",
        "a dachshund wearing a tiny jumper",
        "a parrot on a shoulder",
        "a rabbit on a bed",
        "a hamster held in a hand",
        "a border collie mid-run on grass",
        "an orange cat squinting in sunlight",
        "a pug asleep on a cushion",
    ],
    "car": [
        "a black modified hatchback at night under a street light",
        "a vintage red convertible on a coastal road",
        "a lifted pickup truck in a parking lot",
        "a white sports coupe in an underground garage",
        "a muddy rally car",
        "a lowered Japanese sedan at a meet",
        "a motorbike leaning on a kickstand at sunset",
        "a classic muscle car at a gas station",
        "a dashboard view from the driver seat at night",
        "a grey SUV covered in dust on a dirt road",
    ],
    "anime": [
        "an anime-style character with blue hair and headphones",
        "a chibi anime girl with cat ears",
        "an anime boy in a school uniform looking sideways",
        "an anime character with a red scarf and white hair",
        "a cel-shaded anime character with sunglasses",
        "a mecha pilot anime character portrait",
        "a cute anime mascot creature",
        "an anime-style character with glasses reading",
        "a dark fantasy anime character with a hood",
        "a 90s anime style character with big eyes",
    ],
    "landscape": [
        "a mountain lake at dawn",
        "a foggy forest road",
        "a city skyline at blue hour",
        "a desert highway",
        "a sunset over the sea from a balcony",
        "snowy rooftops seen from a window",
        "a rice terrace in mist",
        "a lighthouse on a cliff",
        "a lavender field",
        "a neon-lit rainy street at night",
        "northern lights over a cabin",
        "a tropical beach with palm trees",
    ],
    "selfie-back": [
        "a person photographed from behind looking at a city view",
        "the back of a person's head with a bun, ocean ahead",
        "a hooded person from behind on a train platform",
        "a person seen from behind walking into a forest",
        "a person from behind with a backpack on a mountain",
        "the back of a person's head with headphones, concert lights ahead",
        "a person from behind sitting on a pier",
        "a person from behind in a stadium crowd",
    ],
    "food": [
        "a bowl of ramen on a wooden table",
        "a slice of pizza held up to the camera",
        "a latte with foam art",
        "a burger and fries in a diner",
        "a sushi platter",
        "a homemade pasta dish",
        "a stack of pancakes with syrup",
        "a street taco close-up",
        "a smoothie bowl with fruit",
        "a plate of birria tacos",
        "a bubble tea held up in front of a street",
        "a croissant on a cafe plate",
    ],
    "gym": [
        "a gym mirror selfie with the phone covering the face, dumbbells behind",
        "a squat rack photographed from a low angle",
        "a flexed arm, face out of frame, gym background",
        "a treadmill display with a water bottle",
        "a pair of running shoes on a track",
        "a boxing bag in a dim gym",
        "a yoga mat on a wooden floor by a window",
        "a basketball on an outdoor court",
        "a bike computer on handlebars mid-ride",
        "a climbing wall with chalk marks",
    ],
}

NON_FACE_STYLE: dict[str, list[str]] = {
    "anime": [
        "anime illustration, clean lineart, flat colours",
        "anime key visual, soft shading",
        "anime screenshot style",
        "digital anime fan art",
    ],
}

NON_FACE_NEGATIVE = (
    "human face, person looking at camera, text, watermark, logo, deformed, "
    "low quality, blurry, nudity"
)
ANIME_NEGATIVE = "photo, photorealistic, text, watermark, logo, deformed, nudity, child"


@dataclass
class Prompt:
    prompt: str
    negative: str
    meta: dict[str, Any] = field(default_factory=dict)


def _weighted(rng: random.Random, weights: dict[str, float]) -> str:
    keys = list(weights)
    return rng.choices(keys, weights=[weights[k] for k in keys], k=1)[0]


def build_face_prompt(rng: random.Random) -> Prompt:
    bucket = _weighted(rng, AGE_WEIGHTS)
    presentation = rng.choice(["masculine", "feminine"])
    ethnicity = rng.choice(ETHNICITY_PHRASES)
    age_phrase = rng.choice(AGE_PHRASES[bucket])
    noun = rng.choice(PRESENTATION_PHRASES[presentation])
    setting = rng.choice(SETTINGS)
    lighting = rng.choice(LIGHTING)
    framing = rng.choice(FRAMING)
    expression = rng.choice(EXPRESSION)
    extra = rng.choice(EXTRAS)
    camera = rng.choice(CAMERA)

    subject = f"{ethnicity} {noun} {age_phrase}"
    if extra:
        subject += f", {extra}"
    prompt = (
        f"{camera} of a {subject}, {expression}, {framing}, {setting}, {lighting}, "
        "candid, realistic skin texture, natural imperfections, no retouching, "
        "social media profile picture"
    )
    return Prompt(
        prompt=prompt,
        negative=FACE_NEGATIVE,
        meta={
            "age_bucket": bucket,
            "presentation": presentation,
            "ethnicity": ethnicity,
            "setting": setting,
            "lighting": lighting,
            "framing": framing,
        },
    )


def build_non_face_prompt(category: str, rng: random.Random) -> Prompt:
    subject = rng.choice(NON_FACE_SUBJECTS[category])
    if category == "anime":
        style = rng.choice(NON_FACE_STYLE["anime"])
        prompt = f"{subject}, {style}, square profile picture, centred"
        return Prompt(prompt=prompt, negative=ANIME_NEGATIVE, meta={"subject": subject})
    lighting = rng.choice(LIGHTING)
    camera = rng.choice(CAMERA)
    prompt = f"{camera} of {subject}, {lighting}, candid, centred subject, social media profile picture"
    return Prompt(prompt=prompt, negative=NON_FACE_NEGATIVE, meta={"subject": subject, "lighting": lighting})


def build_prompt(category: str, seed: int) -> Prompt:
    rng = random.Random(seed)
    if category == "face":
        return build_face_prompt(rng)
    if category in NON_FACE_SUBJECTS:
        return build_non_face_prompt(category, rng)
    raise ValueError(f"unknown category {category!r}")


if __name__ == "__main__":
    import sys

    category = sys.argv[1] if len(sys.argv) > 1 else "face"
    for i in range(5):
        p = build_prompt(category, i)
        print(f"[{i}] {p.prompt}\n     meta={p.meta}")
