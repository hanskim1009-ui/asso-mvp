import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

async function listModels() {
  try {
    const models = await genAI.listModels()
    console.log('사용 가능한 모델들:')
    models.forEach(model => {
      console.log(`- ${model.name}`)
      console.log(`  지원 메서드: ${model.supportedGenerationMethods}`)
    })
  } catch (err) {
    console.error('에러:', err)
  }
}

listModels()
