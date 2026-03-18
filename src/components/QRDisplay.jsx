import { QRCode } from 'react-qr-code'
import toast from 'react-hot-toast'

export default function QRDisplay({ agent }) {
  const url = `${import.meta.env.VITE_APP_URL}/connect?token=${agent.qr_token}`

  const copyLink = async () => {
    await navigator.clipboard.writeText(url)
    toast.success('Link copied!')
  }

  const downloadQR = () => {
    const svgEl = document.querySelector('#qr-code svg')
    if (!svgEl) return
    const svgData = new XMLSerializer().serializeToString(svgEl)
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.onload = () => {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 256, 256)
      ctx.drawImage(img, 0, 0, 256, 256)
      const link = document.createElement('a')
      link.download = `${agent.agent_name}-qr.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      toast.success('QR downloaded!')
    }
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
  }

  return (
    <div>
      <div id="qr-code" className="bg-white border border-gray-200 rounded-xl p-6 inline-block">
        <QRCode value={url} size={200} />
      </div>
      <div className="flex gap-2 mt-3 justify-center">
        <button
          onClick={copyLink}
          className="border border-gray-200 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
        >
          Copy Link
        </button>
        <button
          onClick={downloadQR}
          className="border border-gray-200 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
        >
          Download QR
        </button>
      </div>
    </div>
  )
}
