#!/usr/bin/env python3
"""Prepara exclusivamente Aborto!A2:Q18 + auditoría; no geocodifica Maps."""
import argparse
import csv
import io
import re
import urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parents[1] / "data"
FUENTES = BASE / "aborto-fuentes"
DOCUMENTO = "1cVc7mSo7Xi8dNWG7lI7DNeUuS4G12Dq1dfMB1oPfaAU"
HOJAS = {"aborto": "1498636790", "auditoria": "1498636791"}
# Decisiones de publicación basadas en Pendiente de la auditoría (fila de Aborto).
OMITIR = {
    2: ["codigo_postal"], 3: ["codigo_postal"], 5: ["codigo_postal"],
    10: ["numero_exterior"], 11: ["telefono"], 12: ["telefono"],
    13: ["telefono", "correo_contacto", "horario"],
    14: ["horario"], 15: ["codigo_postal", "numero_exterior"],
}


def preparar():
    filas = list(csv.reader(io.StringIO((FUENTES / "aborto.csv").read_text())))
    auditoria = list(csv.DictReader(io.StringIO((FUENTES / "auditoria.csv").read_text())))
    assert filas[0][15:17] == ["Latitud", "Longitud"], "P/Q cambiaron: revisar fuente"
    assert len(filas) == 18 and len(auditoria) == 17, "Revisar el alcance A2:Q18"
    salida = []
    for numero, fila in enumerate(filas[1:18], 2):
        a = auditoria[numero - 2]
        assert int(a["Fila en Aborto"]) == numero and a["Id"] == fila[0]
        assert a["Unidad de salud"] == fila[3]
        clues = a["CLUES"]
        assert re.fullmatch(r"[A-Z]{5}\d{6}", clues) and clues in fila[11]
        lat, lon = (float(fila[i].replace(",", ".")) for i in (15, 16))
        assert -90 <= lat <= 90 and -180 <= lon <= 180
        omitir = OMITIR.get(numero, []).copy()
        direccion = fila[5].strip()
        cp = re.search(r"C\.?P\.?\s*(\d{5})", direccion, re.I)
        if "codigo_postal" in omitir:
            direccion = re.sub(r"(?:C\.?P\.?\s*)?\b\d{5}\b,?\s*", "", direccion, flags=re.I)
        if "numero_exterior" in omitir:
            numero_pendiente = {10: "418", 15: "75"}[numero]
            direccion = re.sub(rf"\b(?:No\.?\s*)?{numero_pendiente}\b,?\s*", "", direccion)
        # Estos dos artículos no acreditan SAS; se retienen íntegros en el snapshot.
        fuente = "\n".join(linea for linea in fila[11].splitlines()
                           if "ataque-cerebrovascular" not in linea
                           and "centros-de-deteccion-y-diagnostico-de-cancer" not in linea)
        def confirmado(valor):
            return "" if re.search(r"pendiente|sin dato|no disponible|sin n[uú]mero confirmado", valor, re.I) else valor.strip()
        # VARCHAR(20): un teléfono completo de la unidad, nunca un texto truncado.
        telefono_texto = fila[6].split("Unidad:")[-1]
        telefonos = re.findall(r"\b\d{3}\s+\d{3}\s+\d{4}\b", telefono_texto)
        telefono = telefonos[0] if telefonos else ""
        correo = confirmado(fila[8]).split(" / ")[0]
        horario = confirmado(fila[7])
        if "telefono" in omitir:
            telefono = ""
        if "correo_contacto" in omitir:
            correo = ""
        if "horario" in omitir:
            horario = ""
        # No añadir ITS de la fila 16: auditoría solo acredita ILE. Si ya existe,
        # el importador conserva su relación ITS sin modificarla.
        urls = re.findall(r"https?://[^\s]+", fila[13])
        salida.append({
            "id_origen": fila[0].strip(), "clues": clues, "fila_fuente": numero,
            "nombre": fila[3].strip(), "categoria": "ILE", "servicios": "Aborto seguro (ILE)",
            "municipio": fila[2].strip(), "localidad": "Vicente Guerrero" if numero == 13 else "",
            "direccion": direccion, "direccion_identidad": fila[5].strip(),
            "codigo_postal": cp[1] if cp and "codigo_postal" not in omitir else "",
            "telefono": telefono, "correo_contacto": correo, "horario": horario,
            "tipo_institucion": "publica", "nivel_atencion": fila[4].strip(),
            "latitud": f"{lat:.7f}", "longitud": f"{lon:.7f}",
            "situacion_ubicacion": "fija", "verificacion_datos": "verificado", "seleccionado": "si",
            "fuente_origen": fuente, "ubicacion_maps_url": fila[12].strip(),
            "links_relacionados": "\n".join(urls),
            "datos_por_confirmar": a["Pendiente"],
            "verificacion_ubicacion": a["Verificación y cambios"],
            "campos_no_publicar": "|".join(omitir), "requisitos": fila[10].strip(),
            "detalle_servicio": "Servicio listado en el directorio de aborto seguro de la institución.",
            "requiere_cita": "no",
        })
    assert len({r["clues"] for r in salida}) == 17
    with (BASE / "aborto-coordenadas.csv").open("w", newline="") as f:
        escritor = csv.DictWriter(f, fieldnames=list(salida[0]), lineterminator="\n")
        escritor.writeheader()
        escritor.writerows(salida)
    print("Preparadas 17 unidades de Aborto!A2:Q18.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--actualizar-fuentes", action="store_true")
    args = parser.parse_args()
    if args.actualizar_fuentes:
        FUENTES.mkdir(parents=True, exist_ok=True)
        for nombre, gid in HOJAS.items():
            url = f"https://docs.google.com/spreadsheets/d/{DOCUMENTO}/export?format=csv&gid={gid}"
            with urllib.request.urlopen(url, timeout=60) as respuesta:
                (FUENTES / f"{nombre}.csv").write_bytes(respuesta.read())
    preparar()
