import { useCallback, useRef, useState } from 'react'
import { apiPost, apiUploadFile } from '../../api'

const MAX_FILE_BYTES = 8 * 1024 * 1024 // 8 MB — under typical gateway limits

export interface EasyApplyModalProps {
  jobId: number
  jobTitle: string
  companyName: string
  memberId: number
  onClose: () => void
  onSuccess: (payload?: { applicationId?: number }) => void
}

function extLower(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

export function EasyApplyModal({
  jobId,
  jobTitle,
  companyName,
  memberId,
  onClose,
  onSuccess,
}: EasyApplyModalProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [coverLetter, setCoverLetter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const pickFile = useCallback((f: File | null) => {
    setError(null)
    if (!f) {
      setFile(null)
      return
    }
    if (f.size > MAX_FILE_BYTES) {
      setError('File is too large (max 8 MB).')
      setFile(null)
      return
    }
    const ext = extLower(f.name)
    const isPdf = ext === '.pdf' || f.type === 'application/pdf'
    const isTxt = ext === '.txt' || f.type === 'text/plain'
    if (!isPdf && !isTxt) {
      setError('Please upload a PDF or a plain text (.txt) resume.')
      setFile(null)
      return
    }
    setFile(f)
  }, [])

  const submitApplication = useCallback(async () => {
    setError(null)
    if (!file) {
      setError('Choose a resume file to continue.')
      return
    }

    setSubmitting(true)
    try {
      const ext = extLower(file.name)
      const isPdf = ext === '.pdf' || file.type === 'application/pdf'

      if (isPdf) {
        const up = await apiUploadFile<{
          success?: boolean
          message?: string
        }>('/members/resume/upload', file, 'file')
        if (up.success === false) {
          throw new Error(up.message || 'Resume upload failed')
        }
      } else {
        const text = await file.text()
        if (!text.trim()) {
          throw new Error('That file appears empty. Try another resume.')
        }
        const r = await apiPost<{ success?: boolean; message?: string; data?: { application_id?: number } }>(
          '/applications/submit',
          {
            job_id: jobId,
            member_id: memberId,
            resume_text: text.trim(),
            cover_letter: coverLetter.trim() || undefined,
            answers: {},
          },
        )
        if (r.success === false) {
          throw new Error(r.message || 'Application failed')
        }
        const aid = typeof r.data?.application_id === 'number' ? r.data.application_id : undefined
        onSuccess(aid !== undefined ? { applicationId: aid } : undefined)
        return
      }

      const r = await apiPost<{ success?: boolean; message?: string; data?: { application_id?: number } }>(
        '/applications/submit',
        {
          job_id: jobId,
          member_id: memberId,
          cover_letter: coverLetter.trim() || undefined,
          answers: {},
        },
      )
      if (r.success === false) {
        throw new Error(r.message || 'Application failed')
      }
      const aid = typeof r.data?.application_id === 'number' ? r.data.application_id : undefined
      onSuccess(aid !== undefined ? { applicationId: aid } : undefined)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }, [file, coverLetter, jobId, memberId, onSuccess])

  return (
    <div className="modal-overlay easy-apply-overlay" onClick={onClose}>
      <div
        className="modal-content easy-apply-modal"
        role="dialog"
        aria-labelledby="easy-apply-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="easy-apply-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 id="easy-apply-title" className="easy-apply-title">
          Easy Apply
        </h2>
        <p className="easy-apply-job-line">
          <strong>{jobTitle}</strong>
          <span className="easy-apply-at"> · </span>
          {companyName}
        </p>
        <p className="easy-apply-hint">Upload your resume. We accept PDF (recommended) or plain text (.txt).</p>

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          className="easy-apply-file-input"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />

        <button
          type="button"
          className={`easy-apply-dropzone${dragOver ? ' easy-apply-dropzone--active' : ''}${file ? ' easy-apply-dropzone--has-file' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            pickFile(e.dataTransfer.files?.[0] ?? null)
          }}
        >
          {file ? (
            <>
              <span className="easy-apply-file-name">{file.name}</span>
              <span className="easy-apply-file-meta">{(file.size / 1024).toFixed(1)} KB · Click to replace</span>
            </>
          ) : (
            <>
              <span className="easy-apply-drop-main">Drop your resume here or click to browse</span>
              <span className="easy-apply-drop-sub">PDF or .txt · Max 8 MB</span>
            </>
          )}
        </button>

        <label className="easy-apply-label">
          Cover letter <span className="easy-apply-optional">(optional)</span>
          <textarea
            className="easy-apply-textarea"
            rows={4}
            value={coverLetter}
            onChange={(e) => setCoverLetter(e.target.value)}
            placeholder="Why are you a great fit for this role?"
            maxLength={4000}
          />
        </label>

        {error && <p className="easy-apply-error">{error}</p>}

        <div className="easy-apply-actions">
          <button type="button" className="ghost-btn easy-apply-cancel" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="primary easy-apply-submit" onClick={() => void submitApplication()} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit application'}
          </button>
        </div>
      </div>
    </div>
  )
}
