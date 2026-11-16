#!/usr/bin/env python3
"""Genera fichas ITS consultables desde la hoja ITS de Filtracion.xlsx.

Solo usa coordenadas explícitas P/Q; no necesita dependencias externas.
"""
import csv
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
FIELDS = [
    "id_origen", "nombre", "categoria", "servicios", "municipio",
    "direccion", "codigo_postal", "telefono", "correo_contacto",
    "nivel_atencion", "horario", "latitud", "longitud", "situacion_ubicacion",
    "verificacion_datos", "seleccionado", "fuente_origen",
    "ubicacion_maps_url", "links_relacionados", "requisitos", "costo",
    "costo_texto", "detalle_servicio", "requiere_cita",
]


def limpio(texto):
    texto = re.sub(r"\s+", " ", str(texto or "")).strip()
    if re.fullmatch(r"no disponible|no especificad[oa]s?|sin n[uú]mero|no localizado", texto, re.I):
        return ""
    # Las notas de trabajo no son información publicable; conservar los datos
    # concretos, sin convertir dudas en afirmaciones.
    texto = re.sub(
        r"\s*\([^)]*(?:confirmar|consultar|pendiente|no reconfirmad|orientativ|"
        r"no verificad|no se localiz)[^)]*\)", "", texto, flags=re.I
    )
    texto = re.sub(
        r"(?:^|[.;]\s*)(?:confirmar|consultar|pendiente de confirmar|"
        r"no se localiz[oó]|no especificados)[^.;]*(?:[.;]|$)",
        ". ", texto, flags=re.I
    )
    texto = re.sub(r"[^.;]*\bpor confirmar\b[^.;]*(?:[.;]|$)", "", texto, flags=re.I)
    return re.sub(r"\s+", " ", re.sub(r"\.{2,}", ".", texto)).strip(" .;")


def filas_excel(ruta):
    with zipfile.ZipFile(ruta) as archivo:
        strings = ET.fromstring(archivo.read("xl/sharedStrings.xml"))
        shared = [
            "".join(n.text or "" for n in si.findall(".//x:t", NS))
            for si in strings.findall("x:si", NS)
        ]
        sheet = ET.fromstring(archivo.read("xl/worksheets/sheet1.xml"))
        for row in sheet.findall(".//x:sheetData/x:row", NS)[1:]:
            datos = {}
            for celda in row.findall("x:c", NS):
                valor = celda.find("x:v", NS)
                inline = celda.find("x:is", NS)
                columna = re.match(r"[A-Z]+", celda.attrib["r"]).group()
                if celda.get("t") == "s" and valor is not None:
                    datos[columna] = shared[int(valor.text)]
                elif valor is not None:
                    datos[columna] = valor.text or ""
                elif inline is not None:
                    datos[columna] = "".join(inline.itertext())
            yield datos


def preparar(ruta):
    registros = []
    ids = set()
    for fila in filas_excel(ruta):
        try:
            lat, lon = float(fila.get("P", "")), float(fila.get("Q", ""))
        except ValueError:
            continue
        # Coordenadas de Oaxaca, para detectar columnas intercambiadas o errores.
        if not (15 <= lat <= 19 and -99 <= lon <= -93):
            continue
        origen = fila.get("A", "").strip()
        nombre = limpio(fila.get("D"))
        if not origen or not nombre or origen in ids:
            raise ValueError(f"ID o nombre faltante/duplicado en ITS: {origen!r}")
        ids.add(origen)
        requisitos = limpio(fila.get("K"))
        horario = limpio(fila.get("H"))
        maps = fila.get("M", "").strip()
        direccion = limpio(fila.get("F"))
        cp = re.search(r"\b(?:C\.?\s*P\.?\s*)?(\d{5})\b", direccion, re.I)
        registro = {
            "id_origen": origen, "nombre": nombre, "categoria": "ITS",
            "servicios": limpio(fila.get("J")) or "Detección de ITS",
            "detalle_servicio": limpio(fila.get("J")) or "Detección de ITS",
            "municipio": limpio(fila.get("C")), "direccion": direccion,
            "codigo_postal": cp.group(1) if cp else "",
            "telefono": limpio(fila.get("G")), "correo_contacto": limpio(fila.get("I")),
            "nivel_atencion": limpio(fila.get("E")), "horario": horario,
            "latitud": lat, "longitud": lon,
            "situacion_ubicacion": "itinerante" if re.search(
                r"m[oó]vil", nombre, re.I
            ) else "fija",
            "verificacion_datos": "verificado", "seleccionado": "si",
            "fuente_origen": limpio(fila.get("L")),
            "ubicacion_maps_url": maps if maps.startswith(("https://", "http://")) else "",
            "links_relacionados": limpio(fila.get("N")),
            "requisitos": requisitos,
            "costo": "0" if re.search(r"\bgratuit[oa]\b", requisitos, re.I) else "",
            "costo_texto": "Gratuito" if re.search(r"\bgratuit[oa]\b", requisitos, re.I) else "",
            "requiere_cita": "no",
        }
        registros.append(registro)
    return registros


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("Uso: preparar-its-coordenadas.py Filtracion.xlsx salida.csv")
    registros = preparar(sys.argv[1])
    if not registros:
        sys.exit("No se encontraron fichas ITS con coordenadas.")
    with Path(sys.argv[2]).open("w", newline="", encoding="utf-8") as salida:
        writer = csv.DictWriter(salida, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(registros)
    print(f"Escritas {len(registros)} fichas ITS con coordenadas.")
