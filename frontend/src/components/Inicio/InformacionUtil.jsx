import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import EncabezadoUsuario from './EncabezadoUsuario.jsx';
import PiePagina from './PiePagina.jsx';
import '../../styles/Inicio.css';
import EncabezadoClinica from '../Clinica/EncabezadoClinica.jsx'

const APARTADOS = [
  { id: 'panorama', etiqueta: 'Panorama general' },
  { id: 'aborto-legal', etiqueta: 'Aborto legal y métodos' },
  { id: 'verificar-legalidad', etiqueta: 'Clínicas legales' },
  { id: 'centros-its', etiqueta: 'Centros, estudios e ITS' },
  { id: 'fuentes', etiqueta: 'Fuentes oficiales' },
];

const FUENTES_OFICIALES = [
  {
    id: 'lineamiento-aborto-seguro',
    institucion: 'Centro Nacional de Equidad de Género y Salud Reproductiva (2022)',
    titulo: 'Lineamiento Técnico para la Atención del Aborto Seguro en México',
    descripcion:
      'Protocolo clínico federal de la Secretaría de Salud que regula los procedimientos seguros con medicamentos (mifepristona y misoprostol) y Aspiración Manual Endouterina (AMEU).',
    citaParentetica1: '(Centro Nacional de Equidad de Género y Salud Reproductiva [CNEGSR], 2022)',
    citaParenteticaSub: '(CNEGSR, 2022)',
    citaNarrativa: 'Centro Nacional de Equidad de Género y Salud Reproductiva (CNEGSR, 2022)',
    referenciaApa: {
      autor: 'Centro Nacional de Equidad de Género y Salud Reproductiva.',
      anio: '(2022).',
      tituloCursiva: 'Lineamiento técnico para la atención del aborto seguro en México',
      edicionFuente: '(Ed. 2022). Secretaría de Salud.',
      url: 'https://www.gob.mx/salud/cnegsr',
    },
    url: 'https://www.gob.mx/salud/cnegsr',
    etiquetaUrl: 'gob.mx/salud/cnegsr',
  },
  {
    id: 'cofepris-licencias',
    institucion: 'Comisión Federal para la Protección contra Riesgos Sanitarios (2024)',
    titulo: 'Consulta de Licencias Sanitarias, Avisos de Funcionamiento y Registros Sanitarios',
    descripcion:
      'Portal federal para verificar permisos sanitarios de clínicas, consultorios, laboratorios e insumos diagnósticos como pruebas rápidas de VIH y sífilis.',
    citaParentetica1: '(Comisión Federal para la Protección contra Riesgos Sanitarios [COFEPRIS], 2024)',
    citaParenteticaSub: '(COFEPRIS, 2024)',
    citaNarrativa: 'Comisión Federal para la Protección contra Riesgos Sanitarios (COFEPRIS, 2024)',
    referenciaApa: {
      autor: 'Comisión Federal para la Protección contra Riesgos Sanitarios.',
      anio: '(2024).',
      tituloCursiva: 'Consulta de registros sanitarios, licencias sanitarias y avisos de funcionamiento.',
      edicionFuente: 'Gobierno de México.',
      url: 'https://www.gob.mx/cofepris',
    },
    url: 'https://www.gob.mx/cofepris',
    etiquetaUrl: 'gob.mx/cofepris',
  },
  {
    id: 'codigo-penal-oaxaca',
    institucion: 'H. Congreso del Estado Libre y Soberano de Oaxaca (2019)',
    titulo: 'Código Penal para el Estado Libre y Soberano de Oaxaca (Artículos 312 al 316)',
    descripcion:
      'Reforma aprobada el 25 de septiembre de 2019 (Decreto Núm. 806) que despenaliza la interrupción del embarazo hasta las 12 semanas de gestación en Oaxaca y define las excluyentes de responsabilidad penal.',
    citaParentetica1: '(Código Penal para el Estado Libre y Soberano de Oaxaca, 2019, arts. 312–316)',
    citaParenteticaSub: '(Código Penal de Oaxaca, 2019, art. 312)',
    citaNarrativa: 'Código Penal para el Estado Libre y Soberano de Oaxaca (2019, arts. 312–316)',
    referenciaApa: {
      autor: 'H. Congreso del Estado Libre y Soberano de Oaxaca.',
      anio: '(2019, 24 de octubre).',
      tituloCursiva: 'Decreto Núm. 806 por el que se reforman los artículos 312, 313, 315 y 316 del Código Penal para el Estado Libre y Soberano de Oaxaca.',
      edicionFuente: 'Periódico Oficial del Gobierno del Estado de Oaxaca.',
      url: 'https://www.congresooaxaca.gob.mx',
    },
    url: 'https://www.congresooaxaca.gob.mx',
    etiquetaUrl: 'congresooaxaca.gob.mx',
  },
  {
    id: 'oms-directrices',
    institucion: 'Organización Mundial de la Salud (2022)',
    titulo: 'Directrices sobre la atención para el aborto',
    descripcion:
      'Estándares médicos internacionales sobre seguridad clínica, esquemas farmacológicos avalados, manejo del dolor y acompañamiento centrado en la persona.',
    citaParentetica1: '(Organización Mundial de la Salud [OMS], 2022)',
    citaParenteticaSub: '(OMS, 2022)',
    citaNarrativa: 'Organización Mundial de la Salud (OMS, 2022)',
    referenciaApa: {
      autor: 'Organización Mundial de la Salud.',
      anio: '(2022).',
      tituloCursiva: 'Directrices sobre la atención para el aborto.',
      edicionFuente: '',
      url: 'https://www.who.int/es/publications/i/item/9789240039483',
    },
    url: 'https://www.who.int/es/publications/i/item/9789240039483',
    etiquetaUrl: 'who.int — Directrices OMS',
  },
  {
    id: 'sep-cedulas',
    institucion: 'Secretaría de Educación Pública (2024)',
    titulo: 'Registro Nacional de Profesionistas — Consulta de Cédula Profesional',
    descripcion:
      'Buscador público oficial de la Dirección General de Profesiones para comprobar que el personal médico o de enfermería cuenta con título y cédula profesional vigente.',
    citaParentetica1: '(Secretaría de Educación Pública [SEP], 2024)',
    citaParenteticaSub: '(SEP, 2024)',
    citaNarrativa: 'Secretaría de Educación Pública (SEP, 2024)',
    referenciaApa: {
      autor: 'Secretaría de Educación Pública.',
      anio: '(2024).',
      tituloCursiva: 'Registro Nacional de Profesionistas: Consulta de cédulas profesionales.',
      edicionFuente: 'Dirección General de Profesiones.',
      url: 'https://cedulaprofesional.sep.gob.mx',
    },
    url: 'https://cedulaprofesional.sep.gob.mx',
    etiquetaUrl: 'cedulaprofesional.sep.gob.mx',
  },
  {
    id: 'nom-039',
    institucion: 'Secretaría de Salud (2014)',
    titulo: 'Norma Oficial Mexicana NOM-039-SSA2-2014, Para la prevención y control de las infecciones de transmisión sexual',
    descripcion:
      'Regula los procedimientos de diagnóstico clínico y de laboratorio para sífilis (pruebas treponémicas y VDRL/RPR), gonorrea, clamidia, VPH, herpes genital y tricomoniasis.',
    citaParentetica1: '(Secretaría de Salud, 2014)',
    citaParenteticaSub: '(Secretaría de Salud, 2014)',
    citaNarrativa: 'Secretaría de Salud (2014)',
    referenciaApa: {
      autor: 'Secretaría de Salud.',
      anio: '(2014, 1 de junio).',
      tituloCursiva: 'Norma Oficial Mexicana NOM-039-SSA2-2014, Para la prevención y control de las infecciones de transmisión sexual.',
      edicionFuente: 'Diario Oficial de la Federación.',
      url: 'https://www.dof.gob.mx',
    },
    url: 'https://www.dof.gob.mx',
    etiquetaUrl: 'dof.gob.mx — NOM-039-SSA2-2014',
  },
  {
    id: 'nom-046',
    institucion: 'Secretaría de Salud (2016)',
    titulo: 'Norma Oficial Mexicana NOM-046-SSA2-2005. Violencia familiar, sexual y contra las mujeres. Criterios para la prevención y atención',
    descripcion:
      'Establece la obligación de todas las instituciones públicas de salud de garantizar la interrupción voluntaria del embarazo en casos de violación sin requerir denuncia ni autorización judicial previa.',
    citaParentetica1: '(Secretaría de Salud, 2016)',
    citaParenteticaSub: '(Secretaría de Salud, 2016)',
    citaNarrativa: 'Secretaría de Salud (2016)',
    referenciaApa: {
      autor: 'Secretaría de Salud.',
      anio: '(2016, 24 de marzo).',
      tituloCursiva: 'Modificación de la Norma Oficial Mexicana NOM-046-SSA2-2005, Violencia familiar, sexual y contra las mujeres. Criterios para la prevención y atención.',
      edicionFuente: 'Diario Oficial de la Federación.',
      url: 'https://www.cndh.org.mx/DocTR/2016/JUR/A70/01/JUR-20170331-NOR19.pdf',
    },
    url: 'https://www.cndh.org.mx/DocTR/2016/JUR/A70/01/JUR-20170331-NOR19.pdf',
    etiquetaUrl: 'cndh.org.mx — NOM-046-SSA2-2005',
  },
  {
    id: 'censida-nom010',
    institucion: 'Secretaría de Salud y CENSIDA (2018)',
    titulo: 'NOM-010-SSA2-2018, Para la prevención y el control de la infección por Virus de la Inmunodeficiencia Humana',
    descripcion:
      'Garantiza que las pruebas de detección de VIH e ITS sean voluntarias, confidenciales, gratuitas en el sector público y acompañadas de consejería sin discriminación.',
    citaParentetica1: '(Secretaría de Salud & Centro Nacional para la Prevención y el Control del VIH y el Sida [CENSIDA], 2018)',
    citaParenteticaSub: '(Secretaría de Salud & CENSIDA, 2018)',
    citaNarrativa: 'Secretaría de Salud y el Centro Nacional para la Prevención y el Control del VIH y el Sida (CENSIDA, 2018)',
    referenciaApa: {
      autor: 'Secretaría de Salud & Centro Nacional para la Prevención y el Control del VIH y el Sida.',
      anio: '(2018, 28 de abril).',
      tituloCursiva: 'Norma Oficial Mexicana NOM-010-SSA2-2018, Para la prevención y el control de la infección por Virus de la Inmunodeficiencia Humana.',
      edicionFuente: 'Diario Oficial de la Federación.',
      url: 'https://www.gob.mx/censida',
    },
    url: 'https://www.gob.mx/censida',
    etiquetaUrl: 'gob.mx/censida',
  },
  {
    id: 'scjn-criterios',
    institucion: 'Suprema Corte de Justicia de la Nación (2021 / 2023)',
    titulo: 'Acción de Inconstitucionalidad 148/2017 y Amparo en Revisión 267/2023',
    descripcion:
      'Sentencias constitucionales mediante las cuales la SCJN declaró inconstitucional la penalización absoluta del aborto voluntario y ordenó la prestación del servicio en instituciones federales de salud.',
    citaParentetica1: '(Suprema Corte de Justicia de la Nación [SCJN], 2021, 2023)',
    citaParenteticaSub: '(SCJN, 2021, 2023)',
    citaNarrativa: 'Suprema Corte de Justicia de la Nación (SCJN, 2021, 2023)',
    referenciaApa: {
      autor: 'Suprema Corte de Justicia de la Nación.',
      anio: '(2021, 7 de septiembre).',
      tituloCursiva: 'Sentencia dictada por el Tribunal Pleno en la Acción de Inconstitucionalidad 148/2017.',
      edicionFuente: 'Semanario Judicial de la Federación.',
      url: 'https://www.scjn.gob.mx',
    },
    url: 'https://www.scjn.gob.mx',
    etiquetaUrl: 'scjn.gob.mx',
  },
];

/**
 * InformacionUtil - Ventana informativa organizada por apartados individuales.
 * Conserva toda la información jurídica, sanitaria y de derechos original e incorpora
 * el detalle de métodos clínicos de aborto seguro y los tipos de estudios/enfermedades (ITS).
 */
export default function InformacionUtil({ sesion, onSalir, sinEncabezado = false }) {
  const [apartadoActivo, setApartadoActivo] = useState('panorama');

  return (
    <div className="info-util-page">
      {/* Header (80px) */}
      {!sinEncabezado && (
        sesion?.tipo === 'clinica' ? (
          <EncabezadoClinica sesion={sesion} onSalir={onSalir} />
        ) : (
          <EncabezadoUsuario sesion={sesion} onSalir={onSalir} seccionActiva="informacion" />
        )
      )}

      {/* Main Content */}
      <main className="info-util-main">
        <div className="info-util-container">
          {/* Enlace de regreso */}
          <div className="detalle-back-margin">
            <div className="detalle-back-wrap">
              <Link
                to={
                  sesion
                    ? sesion.tipo === 'clinica'
                      ? '/panel-clinica'
                      : sesion.tipo === 'administrador'
                        ? '/admin'
                        : '/inicio'
                    : '/conocenos'
                }
                className="detalle-back-link"
                style={{ textDecoration: 'none' }}
              >
                <span className="detalle-back-icon" aria-hidden="true">
                  <ArrowLeft size={14} color="#001D14" />
                </span>
                <span className="detalle-back-text">Volver al inicio</span>
              </Link>
            </div>
          </div>

          {/* Encabezado y Pestañas */}
          <section className="info-util-hero">
            <div className="inicio-hero-badge">
              <span className="inicio-hero-badge-text">ORIENTACIÓN VERIFICADA · OAXACA</span>
            </div>
            <h1 className="info-util-title">
              Información útil sobre centros, derechos y atención segura en Oaxaca
            </h1>
            <p className="info-util-subtitle">
              Conoce el marco legal vigente en Oaxaca sobre la Interrupción Legal del Embarazo (ILE), los métodos clínicos seguros, cómo comprobar que una clínica esté autorizada, los estudios y enfermedades (ITS) que se detectan y las fuentes oficiales de referencia.
            </p>

            <div className="info-util-tabs" role="tablist" aria-label="Apartados de información útil">
              {APARTADOS.map((item) => {
                const activo = apartadoActivo === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={activo}
                    onClick={() => setApartadoActivo(item.id)}
                    className={`info-util-tab-btn ${activo ? 'is-active' : ''}`}
                  >
                    {item.etiqueta}
                  </button>
                );
              })}
            </div>
          </section>

          {/* APARTADO 0: PANORAMA GENERAL */}
          {apartadoActivo === 'panorama' && (
            <section className="info-util-section-card" aria-labelledby="sec-panorama">
              <div className="info-util-intro-layout">
                <div className="info-util-intro-text-col">
                  <span className="detalle-category-pill">PANORAMA GENERAL · SALUD SEXUAL Y REPRODUCTIVA</span>
                  <h2 id="sec-panorama" className="info-util-section-h2">
                    Guía básica de salud sexual y reproductiva en Oaxaca
                  </h2>
                  <p className="info-util-justify">
                    Contar con información clara, científica y respaldada por la ley permite tomar decisiones autónomas sobre la salud. En Oaxaca, los servicios públicos de detección de infecciones de transmisión sexual (ITS) y de Interrupción Legal del Embarazo (ILE) son derechos protegidos por normativas estatales y federales (H. Congreso del Estado Libre y Soberano de Oaxaca, 2019; Secretaría de Salud, 2016).
                  </p>
                  <p className="info-util-justify">
                    Las unidades públicas brindan atención gratuita conforme a los protocolos del Centro Nacional de Equidad de Género y Salud Reproductiva (CNEGSR, 2022) y del Centro Nacional para la Prevención y el Control del VIH y el Sida (CENSIDA, 2018), mientras que las clínicas privadas y organizaciones acreditadas deben operar bajo licencia sanitaria de la Comisión Federal para la Protección contra Riesgos Sanitarios (COFEPRIS, 2024).
                  </p>
                </div>

                <figure className="info-util-image-frame">
                  <img
                    src="/img/info-intro-salud.jpg"
                    alt="Orientación médica empática y confidencial en Oaxaca"
                    className="info-util-illustration"
                  />
                  <figcaption className="info-util-visual-caption">
                    Atención empática, gratuita y confidencial en Oaxaca
                  </figcaption>
                </figure>
              </div>

              <div className="info-util-grid-3">
                <article className="info-util-box">
                  <h3 className="info-util-box-title">1. Derecho garantizado</h3>
                  <p className="info-util-box-text">
                    En Oaxaca la interrupción voluntaria del embarazo es legal hasta las 12 semanas completas de gestación y las pruebas de detección de ITS son gratuitas en unidades públicas (H. Congreso del Estado Libre y Soberano de Oaxaca, 2019, art. 312; Secretaría de Salud & CENSIDA, 2018).
                  </p>
                </article>

                <article className="info-util-box">
                  <h3 className="info-util-box-title">2. Clínicas verificables</h3>
                  <p className="info-util-box-text">
                    Todo establecimiento legal cuenta con permiso sanitario vigente y personal de salud con cédula profesional registrada ante la Secretaría de Educación Pública (SEP, 2024; COFEPRIS, 2024).
                  </p>
                </article>

                <article className="info-util-box">
                  <h3 className="info-util-box-title">3. Protección de datos personales</h3>
                  <p className="info-util-box-text">
                    Los datos personales, el motivo de consulta y los diagnósticos forman parte del expediente clínico confidencial protegido por la normativa sanitaria federal (Secretaría de Salud, 2016; Secretaría de Salud & CENSIDA, 2018).
                  </p>
                </article>

                <article className="info-util-box">
                  <h3 className="info-util-box-title">4. Métodos seguros de ILE</h3>
                  <p className="info-util-box-text">
                    En los centros autorizados se emplean únicamente métodos clínicos recomendados por la Organización Mundial de la Salud (OMS, 2022) y el CNEGSR (2022): régimen medicamentoso (mifepristona y misoprostol) y Aspiración Manual Endouterina (AMEU).
                  </p>
                </article>

                <article className="info-util-box">
                  <h3 className="info-util-box-title">5. Tamizaje de ITS y VIH</h3>
                  <p className="info-util-box-text">
                    Detección oportuna de VIH, sífilis, hepatitis B y C, VPH, clamidia y gonorrea mediante pruebas rápidas y estudios confirmatorios de laboratorio conforme a las Normas Oficiales Mexicanas vigentes (Secretaría de Salud, 2014; Secretaría de Salud & CENSIDA, 2018).
                  </p>
                </article>

                <article className="info-util-box">
                  <h3 className="info-util-box-title">6. Red pública y comunitaria</h3>
                  <p className="info-util-box-text">
                    De acuerdo con la Suprema Corte de Justicia de la Nación (SCJN, 2021, 2023) y el CNEGSR (2022), las instituciones públicas de salud deben garantizar servicios seguros, oportunos y libres de discriminación.
                  </p>
                </article>
              </div>
            </section>
          )}

          {/* APARTADO 1: MARCO LEGAL DEL ABORTO (ILE) Y MÉTODOS */}
          {apartadoActivo === 'aborto-legal' && (
            <section className="info-util-section-card" aria-labelledby="sec-aborto-legal">
              <div className="info-util-intro-layout">
                <div className="info-util-intro-text-col">
                  <span className="detalle-category-pill">APARTADO 1 · MARCO JURÍDICO Y MÉTODOS CLÍNICOS</span>
                  <h2 id="sec-aborto-legal" className="info-util-section-h2">
                    Interrupción Legal del Embarazo (ILE) en Oaxaca: ¿Qué dice la ley?
                  </h2>
                  <p className="info-util-justify">
                    En septiembre de 2019, Oaxaca se convirtió en la segunda entidad federativa de México en despenalizar el aborto por decisión voluntaria durante el primer trimestre de gestación (H. Congreso del Estado Libre y Soberano de Oaxaca, 2019).
                  </p>
                  <p className="info-util-justify">
                    Además del respaldo jurídico estatal y federal, las instituciones de salud operan bajo el <em>Lineamiento técnico para la atención del aborto seguro en México</em> (Centro Nacional de Equidad de Género y Salud Reproductiva [CNEGSR], 2022) y las directrices clínicas de la Organización Mundial de la Salud (OMS, 2022).
                  </p>
                </div>

                <figure className="info-util-image-frame">
                  <img
                    src="/img/info-marco-legal.jpg"
                    alt="Marco jurídico y protección del derecho a la salud en Oaxaca"
                    className="info-util-illustration"
                  />
                  <figcaption className="info-util-visual-caption">
                    Código Penal de Oaxaca · NOM-046-SSA2-2005 · CNEGSR
                  </figcaption>
                </figure>
              </div>

              <div className="info-util-grid-2">
                <article className="info-util-box">
                  <h3 className="info-util-box-title">
                    1. Hasta las 12 semanas por libre decisión (Código Penal de Oaxaca, Art. 312)
                  </h3>
                  <p className="info-util-box-text">
                    En el estado de Oaxaca, las mujeres y personas con capacidad de gestar tienen derecho a interrumpir su embarazo de forma libre, autónoma y voluntaria <strong>hasta las 12 semanas completas de gestación</strong> (contadas a partir del primer día de la última menstruación), sin necesidad de justificar el motivo (H. Congreso del Estado Libre y Soberano de Oaxaca, 2019, art. 312).
                  </p>
                </article>

                <article className="info-util-box">
                  <h3 className="info-util-box-title">
                    2. Atención por violencia sexual sin denuncia previa (NOM-046-SSA2-2005)
                  </h3>
                  <p className="info-util-box-text">
                    De acuerdo con la Secretaría de Salud (2016), en la <strong>Norma Oficial Mexicana NOM-046-SSA2-2005</strong>, cuando un embarazo es resultado de violencia sexual, todas las instituciones públicas de salud deben brindar la interrupción médica <strong>sin exigir denuncia ante el Ministerio Público ni autorización judicial</strong>; basta con una solicitud por escrito bajo protesta de decir verdad.
                  </p>
                </article>

                <article className="info-util-box">
                  <h3 className="info-util-box-title">
                    3. Causales legales sin límite de semanas (Código Penal de Oaxaca, Art. 316)
                  </h3>
                  <p className="info-util-box-text">
                    Además de las primeras 12 semanas por decisión voluntaria, la legislación estatal establece excluyentes de responsabilidad penal en cualquier etapa gestacional cuando (H. Congreso del Estado Libre y Soberano de Oaxaca, 2019, art. 316):
                  </p>
                  <ul className="info-util-list">
                    <li>El embarazo sea consecuencia de una violación o de inseminación artificial no consentida.</li>
                    <li>Corra peligro la vida o exista riesgo de daño grave a la salud de la persona gestante.</li>
                    <li>Se diagnostiquen alteraciones genéticas o congénitas graves en el producto.</li>
                  </ul>
                </article>

                <article className="info-util-box">
                  <h3 className="info-util-box-title">
                    4. Criterio de la Suprema Corte de Justicia de la Nación (SCJN)
                  </h3>
                  <p className="info-util-box-text">
                    En las sentencias de la Acción de Inconstitucionalidad 148/2017 y del Amparo en Revisión 267/2023, la Suprema Corte de Justicia de la Nación (SCJN, 2021, 2023) declaró inconstitucional la criminalización absoluta del aborto y determinó que las instituciones federales de salud deben brindar el servicio sin discriminación.
                  </p>
                </article>
              </div>

              <div className="info-util-section-header" style={{ paddingTop: '8px' }}>
                <span className="detalle-category-pill">PROCEDIMIENTOS HABITUALES AVALADOS POR LA OMS</span>
                <h3 className="info-util-section-h2">
                  Métodos de interrupción del embarazo que normalmente se realizan
                </h3>
              </div>

              <div className="info-util-grid-2">
                <article className="info-util-box">
                  <h3 className="info-util-box-title">
                    Método 1: Régimen con medicamentos (Mifepristona + Misoprostol)
                  </h3>
                  <p className="info-util-box-text">
                    Es el método no invasivo más frecuente durante las primeras 10 a 12 semanas y cuenta con una eficacia superior al 95%. La <strong>mifepristona</strong> bloquea la hormona progesterona deteniendo el desarrollo gestacional y, de 24 a 48 horas después, el <strong>misoprostol</strong> (vía sublingual, bucal o vaginal) produce contracciones uterinas para vaciar el útero de manera similar a una menstruación abundante. Cuando no se dispone de mifepristona, también se utiliza el esquema con misoprostol solo en dosis pautadas (OMS, 2022; CNEGSR, 2022).
                  </p>
                </article>

                <article className="info-util-box">
                  <h3 className="info-util-box-title">
                    Método 2: Aspiración Manual Endouterina (AMEU)
                  </h3>
                  <p className="info-util-box-text">
                    Es un procedimiento clínico ambulatorio, seguro y breve (toma entre 10 y 15 minutos) indicado en el primer trimestre. Se realiza con <strong>anestesia local</strong> en el cuello uterino (bloqueo paracervical) y analgésicos orales, utilizando una cánula delgada y flexible de plástico conectada a un aspirador manual de vacío. La recuperación dura alrededor de una hora y no requiere hospitalización (CNEGSR, 2022; OMS, 2022).
                  </p>
                </article>

                <article className="info-util-box">
                  <h3 className="info-util-box-title">
                    Valoración médica previa y manejo del dolor
                  </h3>
                  <p className="info-util-box-text">
                    Antes de iniciar cualquiera de los dos métodos, el personal médico realiza una historia clínica, confirma las semanas de gestación (mediante fecha de última menstruación o ultrasonido) y prescribe analgésicos antiinflamatorios no esteroideos (como ibuprofeno o ketorolaco) para el manejo del dolor (CNEGSR, 2022; OMS, 2022).
                  </p>
                </article>

                <article className="info-util-box info-util-box-warning">
                  <h3 className="info-util-box-title">
                    ¿Por qué ya no se recomienda el Legrado Instrumental (LUI)?
                  </h3>
                  <p className="info-util-box-text">
                    Tanto la OMS (2022) como el CNEGSR (2022) desaconsejan el Legrado Uterino Instrumental (raspado con cureta metálica) como primera opción, debido a que el tratamiento farmacológico y la AMEU son métodos modernos más seguros y de menor riesgo clínico.
                  </p>
                </article>
              </div>
            </section>
          )}

          {/* APARTADO 2: CÓMO SABER SI UN CENTRO ES LEGAL Y SEGURO */}
          {apartadoActivo === 'verificar-legalidad' && (
            <section className="info-util-section-card" aria-labelledby="sec-verificar-legalidad">
              <div className="info-util-intro-layout">
                <div className="info-util-intro-text-col">
                  <span className="detalle-category-pill">APARTADO 2 · VERIFICACIÓN SANITARIA Y SEGURIDAD</span>
                  <h2 id="sec-verificar-legalidad" className="info-util-section-h2">
                    ¿Cómo saber si una clínica o centro de salud es legal y seguro?
                  </h2>
                  <p className="info-util-justify">
                    Antes de acudir a un establecimiento privado o asociación, es indispensable verificar que cumpla con la regulación de la Comisión Federal para la Protección contra Riesgos Sanitarios (COFEPRIS, 2024) y de la Secretaría de Educación Pública (SEP, 2024).
                  </p>
                </div>

                <figure className="info-util-image-frame">
                  <img
                    src="/img/info-clinica-segura.jpg"
                    alt="Verificación de clínica legal con licencia sanitaria y cédula profesional"
                    className="info-util-illustration"
                  />
                  <figcaption className="info-util-visual-caption">
                    Verificación ante COFEPRIS, SSO y SEP
                  </figcaption>
                </figure>
              </div>

              <div className="info-util-grid-2">
                <article className="info-util-box">
                  <h3 className="info-util-box-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={17} color="#001D14" aria-hidden="true" />
                    <span>1. Licencia Sanitaria o Aviso de Funcionamiento (COFEPRIS / SSO)</span>
                  </h3>
                  <p className="info-util-box-text">
                    Todo consultorio, clínica o laboratorio legal debe tener a la vista del público su <strong>Aviso de Funcionamiento</strong> y, si realiza procedimientos quirúrgicos o ambulatorios (como AMEU), su <strong>Licencia Sanitaria para Actos Quirúrgicos u Obstétricos</strong> expedida por la autoridad sanitaria (COFEPRIS, 2024).
                  </p>
                </article>

                <article className="info-util-box">
                  <h3 className="info-util-box-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={17} color="#001D14" aria-hidden="true" />
                    <span>2. Cédula Profesional verificable en la SEP</span>
                  </h3>
                  <p className="info-util-box-text">
                    El personal médico que brinde la atención debe proporcionar su nombre completo y número de <strong>Cédula Profesional</strong> en la receta o nota médica. Su validez puede comprobarse en el portal oficial del <strong>Registro Nacional de Profesionistas</strong> (<code>cedulaprofesional.sep.gob.mx</code>) (SEP, 2024).
                  </p>
                </article>

                <article className="info-util-box">
                  <h3 className="info-util-box-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={17} color="#001D14" aria-hidden="true" />
                    <span>3. Métodos clínicos avalados por la OMS y la Secretaría de Salud</span>
                  </h3>
                  <p className="info-util-box-text">
                    De acuerdo con el CNEGSR (2022) y la OMS (2022), únicamente dos procedimientos están recomendados durante el primer trimestre:
                  </p>
                  <ul className="info-util-list">
                    <li><strong>Aborto con medicamentos:</strong> esquema combinado de mifepristona y misoprostol (o misoprostol solo en dosis pautadas).</li>
                    <li><strong>Aspiración Manual Endouterina (AMEU):</strong> procedimiento ambulatorio seguro con anestesia local. El legrado uterino instrumental (LUI) ya no se recomienda como primera opción.</li>
                  </ul>
                </article>

                <article className="info-util-box info-util-box-warning">
                  <h3 className="info-util-box-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={17} color="#8A4B08" aria-hidden="true" />
                    <span>4. Señales de alerta ante centros engañosos o irregulares</span>
                  </h3>
                  <ul className="info-util-list">
                    <li>Lugares sin razón social médica ni aviso de COFEPRIS que se anuncian como «ayuda para el embarazo inesperado», pero buscan retrasar la atención hasta que pasen las 12 semanas legales.</li>
                    <li>Establecimientos que se niegan a entregar nota médica, receta firmada con cédula profesional u hoja de signos de alarma post-procedimiento.</li>
                    <li>Personas que ofrecen infusiones, inyecciones desconocidas o medicamentos sueltos fuera de su blíster original sin registro sanitario (COFEPRIS, 2024; CNEGSR, 2022).</li>
                  </ul>
                </article>
              </div>
            </section>
          )}

          {/* APARTADO 3: CENTROS, ESTUDIOS E ITS */}
          {apartadoActivo === 'centros-its' && (
            <section className="info-util-section-card" aria-labelledby="sec-centros-its">
              <div className="info-util-intro-layout">
                <div className="info-util-intro-text-col">
                  <span className="detalle-category-pill">APARTADO 3 · CENTROS PÚBLICOS, ESTUDIOS E ITS</span>
                  <h2 id="sec-centros-its" className="info-util-section-h2">
                    Información importante sobre los centros de atención en Oaxaca (ITS y Salud Reproductiva)
                  </h2>
                  <p className="info-util-justify">
                    Los centros verificados en el directorio de PuntOax comprenden unidades de los Servicios de Salud de Oaxaca (SSO), CAPASITS, IMSS-Bienestar y organizaciones acreditadas que operan conforme a las Normas Oficiales Mexicanas vigentes (Secretaría de Salud, 2014; Secretaría de Salud & Centro Nacional para la Prevención y el Control del VIH y el Sida [CENSIDA], 2018).
                  </p>
                  <p className="info-util-justify">
                    Para las pruebas rápidas únicamente se toma una gota de sangre del dedo (punción capilar), no se requiere ayuno y el resultado se entrega en 15 a 30 minutos acompañado de consejería confidencial (Secretaría de Salud & CENSIDA, 2018).
                  </p>
                </div>

                <figure className="info-util-image-frame">
                  <img
                    src="/img/info-centros-its.jpg"
                    alt="Pruebas rápidas confidenciales de detección de ITS y VIH"
                    className="info-util-illustration"
                  />
                  <figcaption className="info-util-visual-caption">
                    Pruebas rápidas gratuitas y confidenciales (NOM-010)
                  </figcaption>
                </figure>
              </div>

              {/* Tarjetas originales conservadas */}
              <div className="info-util-grid-3">
                <article className="info-util-box">
                  <h3 className="info-util-box-title">
                    CAPASITS y Centros de Salud (SSO)
                  </h3>
                  <p className="info-util-box-text">
                    Los <strong>CAPASITS</strong> (San Bartolo Coyotepec y Salina Cruz) y los Centros de Salud Urbanos de Oaxaca realizan <strong>pruebas rápidas gratuitas de VIH, sífilis y hepatitis C</strong> en 15 a 30 minutos, además de consejería, entrega de condones y vinculación a tratamiento antirretroviral gratuito (Secretaría de Salud & CENSIDA, 2018).
                  </p>
                </article>

                <article className="info-util-box">
                  <h3 className="info-util-box-title">
                    Confidencialidad protegida (NOM-010-SSA2-2018)
                  </h3>
                  <p className="info-util-box-text">
                    De acuerdo con la <strong>NOM-010-SSA2-2018</strong>, ninguna prueba de detección de VIH o ITS puede aplicarse de manera obligatoria. Los resultados son estrictamente confidenciales, forman parte del expediente clínico protegido por la ley y no pueden entregarse a terceros sin autorización de la persona usuaria (Secretaría de Salud & CENSIDA, 2018, numeral 6.3).
                  </p>
                </article>

                <article className="info-util-box">
                  <h3 className="info-util-box-title">
                    ¿Qué llevar antes de tu visita?
                  </h3>
                  <ul className="info-util-list">
                    <li><strong>Para pruebas rápidas de ITS/VIH:</strong> presentar CURP; no se requiere ayuno ni cita previa dentro del horario matutino de toma de muestras (Secretaría de Salud & CENSIDA, 2018).</li>
                    <li><strong>Para orientación o servicio de ILE:</strong> identificación oficial, CURP y, si se cuenta con él, ultrasonido o prueba de embarazo; de no contar con él, el centro público realiza la valoración clínica (CNEGSR, 2022).</li>
                  </ul>
                </article>
              </div>

              {/* Nuevas tarjetas agregadas sobre tipos de estudios y enfermedades */}
              <div className="info-util-section-header" style={{ paddingTop: '8px' }}>
                <span className="detalle-category-pill">CATÁLOGO DE TAMIZAJE Y LABORATORIO</span>
                <h3 className="info-util-section-h2">
                  Tipos de estudios y enfermedades que se detectan en los centros
                </h3>
              </div>

              <div className="info-util-grid-2">
                <article className="info-util-box">
                  <h3 className="info-util-box-title">
                    1. VIH (Pruebas rápidas de 3.ª y 4.ª generación, CD4 y Carga Viral)
                  </h3>
                  <p className="info-util-box-text">
                    Se aplican pruebas rápidas por punción capilar que detectan anticuerpos contra el VIH-1/2 y el <strong>antígeno p24</strong> (4.ª generación), permitiendo identificar la infección de forma más temprana. Si el resultado es reactivo, el centro realiza sin costo la prueba confirmatoria de laboratorio, conteo de linfocitos <strong>CD4</strong>, estudio de <strong>carga viral</strong> y entrega de tratamiento antirretroviral (TAR) (Secretaría de Salud & CENSIDA, 2018).
                  </p>
                </article>

                <article className="info-util-box">
                  <h3 className="info-util-box-title">
                    2. Sífilis (Prueba rápida treponémica y estudio VDRL / RPR)
                  </h3>
                  <p className="info-util-box-text">
                    Detecta la bacteria <em>Treponema pallidum</em> mediante pruebas rápidas individuales o duales (VIH/Sífilis) en 15 minutos, complementadas con estudios serológicos cuantitativos de laboratorio (<strong>VDRL</strong> o <strong>RPR</strong>) para confirmar la etapa de la infección y brindar tratamiento curativo con penicilina (Secretaría de Salud, 2014).
                  </p>
                </article>

                <article className="info-util-box">
                  <h3 className="info-util-box-title">
                    3. Hepatitis B y Hepatitis C (Tamizaje HBsAg y Anti-VHC)
                  </h3>
                  <p className="info-util-box-text">
                    Los centros realizan pruebas rápidas en sangre para detectar el antígeno de superficie del virus de la <strong>Hepatitis B (HBsAg)</strong> y anticuerpos contra el virus de la <strong>Hepatitis C (Anti-VHC)</strong>. Si el tamizaje resulta reactivo, se confirma mediante prueba molecular (PCR de carga viral) y se vincula a tratamiento antiviral gratuito (Secretaría de Salud, 2014; Secretaría de Salud & CENSIDA, 2018).
                  </p>
                </article>

                <article className="info-util-box">
                  <h3 className="info-util-box-title">
                    4. VPH, Clamidia, Gonorrea y otros estudios ginecológicos
                  </h3>
                  <p className="info-util-box-text">
                    En los Centros de Salud y clínicas especializadas también se realiza citología cervical (<strong>Papanicolaou</strong>), prueba de detección del <strong>Virus del Papiloma Humano (VPH)</strong>, exploración clínica y toma de exudado cervicovaginal o uretral para diagnosticar y tratar <strong>clamidia, gonorrea, tricomoniasis y herpes genital</strong>, además del protocolo de profilaxis <strong>PrEP y PEP</strong> (Secretaría de Salud, 2014; Secretaría de Salud & CENSIDA, 2018).
                  </p>
                </article>
              </div>

              <div className="info-util-cta-banner">
                <div className="info-util-cta-texts">
                  <h3 className="info-util-cta-title">¿Buscas un centro verificado cerca de ti?</h3>
                  <p className="info-util-cta-desc">
                    Consulta el directorio interactivo con horarios, dirección exacta, teléfono, requisitos y servicios por municipio.
                  </p>
                </div>
                {sesion ? (
                  <Link to="/mapa" className="inicio-hero-cta-link">
                    <span className="inicio-hero-cta-text">Ir al mapa de centros</span>
                    <span className="inicio-hero-cta-icon" aria-hidden="true">
                      <ArrowRight size={14} color="#FFFFFF" />
                    </span>
                  </Link>
                ) : (
                  <Link
                    to="/login"
                    state={{
                      aviso: 'Necesitas iniciar sesión o crear una cuenta para ver el mapa de centros de salud.',
                      from: '/mapa',
                    }}
                    className="inicio-hero-cta-link"
                  >
                    <span className="inicio-hero-cta-text">Iniciar sesión para ver el mapa</span>
                    <span className="inicio-hero-cta-icon" aria-hidden="true">
                      <ArrowRight size={14} color="#FFFFFF" />
                    </span>
                  </Link>
                )}
              </div>
            </section>
          )}

          {/* APARTADO 4: FUENTES OFICIALES */}
          {apartadoActivo === 'fuentes' && (
            <section className="info-util-section-card" aria-labelledby="sec-fuentes">
              <div className="info-util-section-header">
                <span className="detalle-category-pill">APARTADO 4 · FUENTES REALES Y DOCUMENTOS OFICIALES</span>
                <h2 id="sec-fuentes" className="info-util-section-h2">
                  Referencias normativas y portales oficiales de consulta
                </h2>
                <p className="info-util-section-lead">
                  Toda la información de esta guía proviene de leyes estatales vigentes, Normas Oficiales Mexicanas (NOM) y organismos públicos de salud nacionales e internacionales:
                </p>
              </div>

              {/* Lista formal de Referencias APA 7 con sangría francesa */}
              <div className="info-util-apa-list-card" aria-label="Lista de referencias">
                <h3 className="info-util-apa-list-heading">Referencias</h3>
                <div className="info-util-apa-entries">
                  {FUENTES_OFICIALES.map((fuente) => (
                    <p key={`ref-${fuente.id}`} className="info-util-apa-hanging">
                      {fuente.referenciaApa.autor} {fuente.referenciaApa.anio}{' '}
                      <em>{fuente.referenciaApa.tituloCursiva}</em>{' '}
                      {fuente.referenciaApa.edicionFuente
                        ? `${fuente.referenciaApa.edicionFuente} `
                        : ''}
                      <a
                        href={fuente.referenciaApa.url}
                        target="_blank"
                        rel="noreferrer"
                        className="info-util-apa-url"
                      >
                        {fuente.referenciaApa.url}
                      </a>
                    </p>
                  ))}
                </div>
              </div>

              <div className="info-util-sources-grid">
                {FUENTES_OFICIALES.map((fuente) => (
                  <article key={fuente.id} className="info-util-source-item">
                    <div className="info-util-source-body">
                      <span className="info-util-source-org">{fuente.institucion}</span>
                      <h3 className="info-util-source-title">{fuente.titulo}</h3>
                      <p className="info-util-source-desc">{fuente.descripcion}</p>
                    </div>
                    <a
                      href={fuente.url}
                      target="_blank"
                      rel="noreferrer"
                      className="info-util-source-link"
                    >
                      <span>Consultar fuente ({fuente.etiquetaUrl})</span>
                      <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <PiePagina />
    </div>
  );
}
