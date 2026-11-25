// Un solo campo internacional evita duplicar +52 al pegar o autocompletar.
export default function CampoTelefono(props) {
  return <input {...props} type="tel" inputMode="tel" autoComplete="tel"
    maxLength={64} placeholder="+52 951 123 4567" />
}
