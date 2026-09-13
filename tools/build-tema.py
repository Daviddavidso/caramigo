#!/usr/bin/env python3
"""Genera art-rojo.html a partir de art.html (misma página, acento rojo).
Ejecutar tras cualquier cambio en art.html:  python3 tools/build-tema.py"""
import pathlib, sys

base = pathlib.Path(__file__).resolve().parent.parent
src = (base / 'art.html').read_text()

if 'css/art.css' not in src:
    sys.exit('art.html no enlaza css/art.css')

out = src.replace(
    '<link rel="stylesheet" href="css/art.css">',
    '<link rel="stylesheet" href="css/art.css">\n<link rel="stylesheet" href="css/tema-rojo.css">'
).replace(
    '<title>Donde cada coche se mira dos veces · caramigo.es</title>',
    '<title>Donde cada coche se mira dos veces · caramigo.es (rojo)</title>'
)
(base / 'art-rojo.html').write_text(out)
print('art-rojo.html generado (%d bytes)' % len(out))
