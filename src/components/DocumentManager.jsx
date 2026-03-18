import { useState, useEffect, useRef } from 'react'
import { uploadDocument, getAgentDocuments, deleteDocument, getDocumentContent, supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { Upload, FileText, Trash2, X, CheckCircle, AlertCircle, Loader } from 'lucide-react'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_FILES = 10
const ACCEPTED_TYPES = '.txt,.md,.pdf,.csv,.json,.doc,.docx'
const READABLE_EXTENSIONS = ['txt', 'md', 'csv', 'json']

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileExtension(fileName) {
  return fileName.split('.').pop().toLowerCase()
}

function StatusBadge({ status }) {
  if (status === 'processing') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#f59e0b]/10 text-[#f59e0b]">
        <Loader className="w-3 h-3 animate-spin" />
        Processing
      </span>
    )
  }
  if (status === 'ready') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#edf5f0] text-[#2d6b4a]">
        <CheckCircle className="w-3 h-3" />
        Ready
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#ff3b30]/10 text-[#ff3b30]">
      <AlertCircle className="w-3 h-3" />
      Error
    </span>
  )
}

export default function DocumentManager({ agent }) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const fileInputRef = useRef(null)

  const loadDocuments = async () => {
    if (!agent?.id) return
    const { data, error } = await getAgentDocuments(agent.id)
    if (error) {
      toast.error('Failed to load documents')
    }
    setDocuments(data)
    setLoading(false)
  }

  useEffect(() => {
    loadDocuments()
  }, [agent?.id])

  const processFile = async (doc) => {
    const ext = getFileExtension(doc.file_name)
    try {
      if (READABLE_EXTENSIONS.includes(ext)) {
        const { content, error } = await getDocumentContent(doc.file_path)
        if (error) throw error
        await supabase
          .from('agent_documents')
          .update({ status: 'ready', content_length: content ? content.length : 0 })
          .eq('id', doc.id)
      } else {
        // pdf, doc, docx - mark as ready with a note that only text content is extracted
        await supabase
          .from('agent_documents')
          .update({ status: 'ready', content_length: 0 })
          .eq('id', doc.id)
      }
    } catch (err) {
      await supabase
        .from('agent_documents')
        .update({ status: 'error' })
        .eq('id', doc.id)
    }
    await loadDocuments()
  }

  const handleUpload = async (files) => {
    if (!files || files.length === 0) return
    if (documents.length >= MAX_FILES) {
      toast.error(`Maximum ${MAX_FILES} files per agent`)
      return
    }

    const filesToUpload = Array.from(files).slice(0, MAX_FILES - documents.length)
    setUploading(true)

    for (const file of filesToUpload) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} exceeds 5MB limit`)
        continue
      }

      const ext = getFileExtension(file.name)
      const allowedExts = ['txt', 'md', 'pdf', 'csv', 'json', 'doc', 'docx']
      if (!allowedExts.includes(ext)) {
        toast.error(`${file.name} — unsupported file type`)
        continue
      }

      const { data: doc, error } = await uploadDocument(agent.id, file)
      if (error) {
        toast.error(`Failed to upload ${file.name}: ${error.message}`)
        continue
      }

      toast.success('Document uploaded!')
      await processFile(doc)
    }

    setUploading(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleUpload(e.dataTransfer.files)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setDragOver(false)
  }

  const handleFileSelect = (e) => {
    handleUpload(e.target.files)
    e.target.value = ''
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await deleteDocument(deleteTarget.id, deleteTarget.file_path)
    if (error) {
      toast.error('Failed to delete document')
    } else {
      toast.success('Document deleted')
    }
    setDeleteTarget(null)
    setDeleting(false)
    await loadDocuments()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-[3px] border-[#0a1628]/20 border-t-[#0a1628] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
          dragOver
            ? 'border-[#0ea5e9] bg-[#0ea5e9]/5'
            : 'border-[#e2e8f0] hover:border-[#0ea5e9] hover:bg-[#f5f3ee]/50'
        } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        {uploading ? (
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 border-[3px] border-[#0a1628]/20 border-t-[#0a1628] rounded-full animate-spin mb-3" />
            <p className="text-sm font-medium text-[#0f172a]">Uploading...</p>
          </div>
        ) : (
          <>
            <Upload className="w-8 h-8 mx-auto text-[#94a3b8] mb-3" />
            <p className="text-sm font-medium text-[#0f172a]">
              Drop files here or click to upload
            </p>
            <p className="text-xs text-[#94a3b8] mt-1">
              .txt, .md, .csv, .json, .pdf, .doc, .docx — Max 5MB per file
            </p>
            <p className="text-xs text-[#94a3b8]">
              {documents.length}/{MAX_FILES} files uploaded
            </p>
          </>
        )}
      </div>

      {/* Document List */}
      {documents.length === 0 ? (
        <div className="text-center py-6">
          <FileText className="w-10 h-10 mx-auto text-[#94a3b8]/30 mb-2" />
          <p className="text-sm text-[#64748b]">No documents uploaded.</p>
          <p className="text-xs text-[#94a3b8]">Upload files to give your agent company knowledge.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div key={doc.id} className="bg-[#f5f3ee] rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-lg bg-[#0ea5e9]/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4 text-[#0ea5e9]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#0f172a] truncate">{doc.file_name}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-[#94a3b8]">{formatFileSize(doc.file_size)}</span>
                    <span className="text-xs text-[#94a3b8]">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </span>
                    <StatusBadge status={doc.status} />
                  </div>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setDeleteTarget(doc)
                }}
                className="text-[#ff3b30] hover:bg-[#ff3b30]/5 rounded-lg p-2 transition-all duration-200 flex-shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#ff3b30]/10 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-[#ff3b30]" />
              </div>
              <div>
                <h3 className="font-semibold text-[#0f172a]">Delete Document</h3>
                <p className="text-sm text-[#64748b]">
                  Remove <span className="font-medium text-[#0f172a]">{deleteTarget.file_name}</span>?
                </p>
              </div>
            </div>
            <p className="text-sm text-[#64748b] mb-6">
              This document will be permanently deleted and removed from your agent's knowledge base.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="bg-[#f5f3ee] hover:bg-[#e8e5de] text-[#0f172a] rounded-lg px-5 py-2.5 text-sm font-medium transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="bg-[#ff3b30] hover:bg-[#ff453a] text-white rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-50 transition-all duration-200"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
