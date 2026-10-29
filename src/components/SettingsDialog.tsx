import { useId, useRef, useState } from 'react'

interface SettingsDialogProps {
  apiKey: string | undefined
  onUpdateApiKey: (key: string) => void
  onExport: () => string
  onImport: (json: string) => void
}

export function SettingsDialog({ apiKey, onUpdateApiKey, onExport, onImport }: SettingsDialogProps) {
  const formId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [keyDraft, setKeyDraft] = useState(apiKey ?? '')
  const [importError, setImportError] = useState<string | null>(null)
  const [importedAt, setImportedAt] = useState<string | null>(null)

  function handleExport() {
    const json = onExport()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `depot-export-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setImportError(null)
    try {
      const text = await file.text()
      onImport(text)
      setImportedAt(new Date().toLocaleTimeString('de-DE'))
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Import fehlgeschlagen.')
    } finally {
      event.target.value = ''
    }
  }

  return (
    <div className="settings-panel">
      <div className="field">
        <label htmlFor={`${formId}-apikey`} className="field-label">
          Alpha Vantage API-Key
        </label>
        <div className="symbol-row">
          <input
            id={`${formId}-apikey`}
            type="password"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder="kostenlos unter alphavantage.co/support/#api-key"
          />
          <button type="button" onClick={() => onUpdateApiKey(keyDraft.trim())}>
            Speichern
          </button>
        </div>
        <p className="field-hint">
          Wird nur lokal in diesem Browser gespeichert, nie exportiert oder an Dritte gesendet.
        </p>
      </div>

      <div className="settings-io">
        <div>
          <span className="field-label">Daten sichern</span>
          <p className="field-hint">Transaktionen und Wertpapiere als JSON-Datei herunterladen.</p>
          <button type="button" onClick={handleExport}>
            Exportieren
          </button>
        </div>
        <div>
          <span className="field-label">Daten wiederherstellen</span>
          <p className="field-hint">Ersetzt alle aktuellen Transaktionen und Wertpapiere.</p>
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Importieren…
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportFile}
            style={{ display: 'none' }}
          />
          {importError && <p className="form-error">{importError}</p>}
          {importedAt && !importError && <p className="field-hint">Importiert um {importedAt}.</p>}
        </div>
      </div>
    </div>
  )
}
