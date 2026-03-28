import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { UploadCloud, CheckCircle2, RotateCcw, AlertCircle, Users, MapPin, Calendar } from 'lucide-react';

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Settings
  const [refDateStr, setRefDateStr] = useState(new Date().toISOString().split('T')[0]);
  const [excludeKeywords, setExcludeKeywords] = useState('leiding, stam, vzw, bestuur');

  const fileInputRef = useRef(null);

  const calculateAge = (dob, refDate) => {
    let birthDate;
    if (typeof dob === 'number') {
      // Excel serial date format (approximate)
      birthDate = new Date((dob - 25569) * 86400 * 1000);
    } else if (typeof dob === 'string') {
      // Trying to parse standard string Date
      // if format is dd/mm/yyyy convert to mm/dd/yyyy for js parser
      let parsed = dob;
      if (dob.includes('/')) {
        const parts = dob.split('/');
        if (parts.length === 3 && parts[2].length === 4) {
          parsed = `${parts[1]}/${parts[0]}/${parts[2]}`; // mm/dd/yyyy
        }
      }
      birthDate = new Date(parsed);
    } else {
       return null;
    }

    if (isNaN(birthDate.getTime())) return null;

    let age = refDate.getFullYear() - birthDate.getFullYear();
    const m = refDate.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && refDate.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const processFile = (file) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const ab = e.target.result;
        const workbook = XLSX.read(ab, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
        
        if (rows.length < 2) throw new Error("Het bestand lijkt geen data te hebben.");

        // Find relevant column indices dynamically
        const headers = rows[0].map(h => typeof h === 'string' ? h.toLowerCase() : '');
        
        const getColIdx = (aliases) => {
          for (let alias of aliases) {
            const idx = headers.findIndex(h => h.includes(alias));
            if (idx !== -1) return idx;
          }
          return -1;
        };

        const postcodeIdx = getColIdx(['postcode', 'adres 1: postcode']);
        const dobIdx = getColIdx(['geboorte', 'geboortedatum']);
        const takkenIdx = getColIdx(['tak', 'takken']);

        if (postcodeIdx === -1 || dobIdx === -1 || takkenIdx === -1) {
          throw new Error("Kon niet alle benodigde kolommen vinden (Postcode, Geboortedatum, Takken). Controleer of ze in de Excel staan!");
        }

        const parsedMembers = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0 || !row[dobIdx]) continue; // Skip empty rows
          
          parsedMembers.push({
            postcode: row[postcodeIdx] ? String(row[postcodeIdx]).trim() : null,
            geboortedatum: row[dobIdx],
            tak: row[takkenIdx] ? String(row[takkenIdx]).trim() : "Onbekend"
          });
        }

        setData(parsedMembers);
      } catch (err) {
        setError(err.message);
      }
    };
    reader.onerror = () => {
      setError("Fout bij het lezen van het bestand.");
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  // Derived statistics
  const stats = useMemo(() => {
    if (!data) return null;

    const refDate = new Date(refDateStr);
    const excludeList = excludeKeywords.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);

    let totalWithPostcode = 0;
    
    const geo = {
      wilrijk: 0,
      antwerpen: 0,
      berchem: 0,
      hoboken: 0,
      overige: 0,
      buiten: 0
    };

    let youthCount = 0; // 6 t/m 25 (geen begeleiders)
    const takkenMap = {};
    let totalTakkenDeelnemers = 0;

    data.forEach(mem => {
      // 1. Geografie
      if (mem.postcode) {
        totalWithPostcode++;
        const pc = parseInt(mem.postcode, 10);
        if (pc === 2610) geo.wilrijk++;
        else if ([2000, 2018, 2020, 2030, 2050, 2060].includes(pc)) geo.antwerpen++;
        else if (pc === 2600) geo.berchem++;
        else if (pc === 2660) geo.hoboken++;
        else if ([2140, 2100, 2170, 2180, 2040].includes(pc)) geo.overige++;
        else geo.buiten++;
      }

      // Pre-check for begeleider
      const takLower = mem.tak.toLowerCase();
      const isBegeleider = excludeList.some(k => takLower.includes(k));

      // 2. Leeftijd 6 t/m 25
      const age = calculateAge(mem.geboortedatum, refDate);
      if (age !== null && age >= 6 && age <= 25 && !isBegeleider) {
        youthCount++;
      }

      // 3. Takken groeperen
      if (!takkenMap[mem.tak]) {
        takkenMap[mem.tak] = { count: 0, minAge: 999, maxAge: -1 };
      }
      takkenMap[mem.tak].count++;
      totalTakkenDeelnemers++;
      if (age !== null) {
        if (age < takkenMap[mem.tak].minAge) takkenMap[mem.tak].minAge = age;
        if (age > takkenMap[mem.tak].maxAge) takkenMap[mem.tak].maxAge = age;
      }
    });

    const getPerc = (count) => totalWithPostcode === 0 ? "0%" : ((count / totalWithPostcode) * 100).toFixed(1) + "%";

    return { totalWithPostcode, geo, getPerc, youthCount, takkenMap, ObjectKeys: Object.keys(takkenMap), totalTakkenDeelnemers };
  }, [data, refDateStr, excludeKeywords]);


  return (
    <div className="container">
      <div className="header">
        <h1>Werkingsubsidies Tool</h1>
        <p>Automatisch uw antwoorden genereren voor de werkingsubsidies van de Stad Antwerpen</p>
      </div>

      {!data && (
        <div className="card">
          <h2>Hoe kom je aan de Excel?</h2>
          <div className="steps">
            <div className="step-item">
              <div className="step-number">1</div>
              <div className="step-content">
                <p>Open de Stamhoofd app</p>
                <span>Log in op jouw scouts stamhoofd pagina.</span>
              </div>
            </div>
            <div className="step-item">
              <div className="step-number">2</div>
              <div className="step-content">
                <p>Druk op 'Takken' en dan op 'Alle leden'</p>
              </div>
            </div>
            <div className="step-item">
              <div className="step-number">3</div>
              <div className="step-content">
                <p>Druk op de download knop en kies voor Excel</p>
              </div>
            </div>
            <div className="step-item">
              <div className="step-number">4</div>
              <div className="step-content">
                <p>Selecteer de juiste kolommen</p>
                <span>Download enkel <strong>geboortedatum</strong>, <strong>alles van "adres 1"</strong> en ook <strong>"takken"</strong>.</span>
              </div>
            </div>
          </div>

          <div 
            className={`upload-zone ${isDragging ? 'drag-active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadCloud className="upload-icon" />
            <div className="upload-text">Sleep het Excel-bestand hiernaartoe of klik om te uploaden</div>
            <div className="upload-subtext">Verwerking gebeurt lokaal, veilig en snel in uw browser.</div>
            <input 
              type="file" 
              accept=".xlsx,.xls" 
              className="hidden-input" 
              ref={fileInputRef} 
              style={{ display: 'none' }}
              onChange={handleChange}
            />
          </div>
          {error && (
            <div style={{color: 'red', marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
              <AlertCircle size={18} /> {error}
            </div>
          )}
        </div>
      )}

      {data && stats && (
        <div className="animate-fade-in card">
          <div className="settings">
            <div className="form-group">
              <label>Peildatum voor leeftijd</label>
              <input type="date" value={refDateStr} onChange={(e) => setRefDateStr(e.target.value)} />
            </div>
            <div className="form-group" style={{flex: 1, minWidth: '250px'}}>
              <label>Sluit takken met deze woorden uit (voor vraag 2)</label>
              <input type="text" value={excludeKeywords} onChange={(e) => setExcludeKeywords(e.target.value)} placeholder="bijv. leiding, stam" />
            </div>
            <div>
              <button className="reset-btn" onClick={() => setData(null)}>
                <RotateCcw /> Nieuw Bestand
              </button>
            </div>
          </div>
          
          <div className="results-section">
            <div className="mb-4">
              <span style={{background: 'var(--primary-100)', color: 'var(--primary-700)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-xl)', fontWeight: '500', display: 'inline-flex', alignItems: 'center', gap: '0.5rem'}}>
                <CheckCircle2 size={18}/> Ingelezen leden: {data.length}
              </span>
            </div>
            
            <p className="upload-subtext" style={{marginBottom: '2rem'}}>
              Deze tool beantwoordt o.a. de geografische wegingen, leeftijdscategorie en takverdeling. 
              Gezien een subsidie-aanvraag complex is, kijk ook even naar een indiening van vorig jaar voor andere simpele ja/nee vragen!
            </p>

            {/* Geografie */}
            <h2><MapPin size={24} color="var(--primary-600)"/> Geografie (% van de leden/deelnemers)</h2>
            <div className="stat-grid">
              <div className="stat-box">
                <span className="stat-label">District Wilrijk *</span>
                <span className="stat-value">{stats.getPerc(stats.geo.wilrijk)}</span>
                <span className="stat-subvalue">({stats.geo.wilrijk} leden)</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">District Antwerpen *</span>
                <span className="stat-value">{stats.getPerc(stats.geo.antwerpen)}</span>
                <span className="stat-subvalue">({stats.geo.antwerpen} leden)</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">District Berchem *</span>
                <span className="stat-value">{stats.getPerc(stats.geo.berchem)}</span>
                <span className="stat-subvalue">({stats.geo.berchem} leden)</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">District Hoboken *</span>
                <span className="stat-value">{stats.getPerc(stats.geo.hoboken)}</span>
                <span className="stat-subvalue">({stats.geo.hoboken} leden)</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">Overige districten *</span>
                <span className="stat-value">{stats.getPerc(stats.geo.overige)}</span>
                <span className="stat-subvalue">({stats.geo.overige} leden)</span>
              </div>
              <div className="stat-box highlight">
                <span className="stat-label">Buiten stad Antwerpen *</span>
                <span className="stat-value">{stats.getPerc(stats.geo.buiten)}</span>
                <span className="stat-subvalue">({stats.geo.buiten} leden)</span>
              </div>
            </div>

            <hr className="results-divider" />

            {/* Youth Count */}
            <h2><Calendar size={24} color="var(--primary-600)"/> Aantal leden tussen 6 t/m 25 jaar (geen begeleiders)</h2>
            <div className="stat-box highlight" style={{maxWidth: '400px'}}>
              <span className="stat-value">{stats.youthCount} leden</span>
              <span className="stat-subvalue" style={{color: 'var(--text-primary)', marginTop: '0.5rem'}}>
                <strong>Tip:</strong> Vermeld bij het antwoord dat hier mogelijks mensen met een beperking bijzitten.
              </span>
            </div>

            <hr className="results-divider" />

            {/* Takken */}
            <h2><Users size={24} color="var(--primary-600)"/> Opdeling in takken</h2>
            <p style={{marginBottom: '1.5rem', color: 'var(--text-secondary)'}}>
              Vul per tak de leeftijden en aantallen aan in je document. Totaal deelnemers van alle takken tezamen: <strong>{stats.totalTakkenDeelnemers}</strong>
            </p>
            
            <div className="takken-grid">
              {stats.ObjectKeys.sort().map(tak => {
                const t = stats.takkenMap[tak];
                const ageText = t.count === 0 || t.minAge === 999 ? "Onbekend" : `${t.minAge} - ${t.maxAge} jaar`;
                
                return (
                  <div key={tak} className="tak-card">
                    <h3>{tak}</h3>
                    <div className="tak-info">
                      <span className="tak-info-label">Leeftijd deelnemers:</span>
                      <span className="tak-info-value">{ageText}</span>
                    </div>
                    <div className="tak-info">
                      <span className="tak-info-label">Aantal deelnemers:</span>
                      <span className="tak-info-value">{t.count}</span>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
