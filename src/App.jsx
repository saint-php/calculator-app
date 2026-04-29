import { useState, useEffect, useRef } from 'react'
import './App.css'

function App() {
  const [display, setDisplay] = useState('0')
  const [previousValue, setPreviousValue] = useState(null)
  const [operator, setOperator] = useState(null)
  const [waitingForOperand, setWaitingForOperand] = useState(false)
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [showScientific, setShowScientific] = useState(false)
  const [showSmartSolve, setShowSmartSolve] = useState(false)
  const [smartQuery, setSmartQuery] = useState('')
  const [smartResult, setSmartResult] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState(null)
  const [apiStatus, setApiStatus] = useState(null)
  const recognitionRef = useRef(null)

  // Check API health on mount
  useEffect(() => {
    checkApiHealth()
  }, [])

  const checkApiHealth = async () => {
    try {
      const res = await fetch('/api/health')
      const data = await res.json()
      setApiStatus(data.status === 'ok' ? 'connected' : 'error')
    } catch {
      setApiStatus('offline')
    }
  }

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = false
      recognitionRef.current.interimResults = false
      recognitionRef.current.lang = 'en-US'

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript
        if (showSmartSolve) {
          setSmartQuery(transcript)
        } else {
          processVoiceCommand(transcript.toLowerCase().trim())
        }
        setIsListening(false)
      }

      recognitionRef.current.onerror = () => {
        setIsListening(false)
        setError('Voice recognition error. Please try again.')
        setTimeout(() => setError(null), 3000)
      }

      recognitionRef.current.onend = () => {
        setIsListening(false)
      }
    }
  }, [showSmartSolve])

  const processVoiceCommand = (command) => {
    setError(null)
    const numberWords = {
      'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
      'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
      'ten': '10', 'eleven': '11', 'twelve': '12', 'twenty': '20',
      'thirty': '30', 'forty': '40', 'fifty': '50', 'hundred': '100',
      'point': '.', 'dot': '.'
    }

    let processed = command
    Object.entries(numberWords).forEach(([word, digit]) => {
      processed = processed.replace(new RegExp(`\b${word}\b`, 'g'), digit)
    })

    const operations = {
      'plus': '+', 'add': '+', 'minus': '-', 'subtract': '-',
      'times': '*', 'multiply': '*', 'divided by': '/', 'divide': '/',
      'over': '/', 'power': '^', 'raised to': '^', 'squared': '^2',
      'square root of': 'sqrt(', 'square root': 'sqrt(', 'root': 'sqrt(',
      'sine': 'sin(', 'cosine': 'cos(', 'tangent': 'tan(',
      'sin': 'sin(', 'cos': 'cos(', 'tan': 'tan(',
      'log': 'log(', 'natural log': 'ln(', 'ln': 'ln(',
      'pi': 'pi', 'e': 'e'
    }

    Object.entries(operations).forEach(([word, symbol]) => {
      processed = processed.replace(new RegExp(`\b${word}\b`, 'g'), symbol)
    })

    if (processed.includes('equals') || processed.includes('calculate') || processed.includes('is')) {
      processed = processed.replace(/equals|calculate|is/g, '=')
    }

    processed = processed.replace(/\s+/g, '').replace(/=/g, '')

    if (processed) {
      if (/^[\d.]+$/.test(processed)) {
        inputDigit(processed)
      } else {
        try {
          const result = evaluateExpression(processed)
          if (result !== null) {
            setDisplay(String(result))
            setPreviousValue(null)
            setOperator(null)
            setWaitingForOperand(true)
          }
        } catch (e) {
          setError('Could not understand: "' + command + '"')
          setTimeout(() => setError(null), 3000)
        }
      }
    }
  }

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) {
      setError('Voice recognition not supported in this browser')
      setTimeout(() => setError(null), 3000)
      return
    }

    if (isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    } else {
      setError(null)
      recognitionRef.current.start()
      setIsListening(true)
    }
  }

  const evaluateExpression = (expr) => {
    try {
      expr = expr.replace(/sin\(/g, 'Math.sin(')
             .replace(/cos\(/g, 'Math.cos(')
             .replace(/tan\(/g, 'Math.tan(')
             .replace(/log\(/g, 'Math.log10(')
             .replace(/ln\(/g, 'Math.log(')
             .replace(/sqrt\(/g, 'Math.sqrt(')
             .replace(/\^/g, '**')
             .replace(/pi/g, 'Math.PI')
             .replace(/e/g, 'Math.E')

      // eslint-disable-next-line no-new-func
      const result = new Function('return ' + expr)()

      if (isNaN(result) || !isFinite(result)) {
        throw new Error('Invalid result')
      }

      return parseFloat(result.toFixed(10))
    } catch (e) {
      return null
    }
  }

  // Wolfram Alpha Smart Solve
  const solveWithWolfram = async () => {
    if (!smartQuery.trim()) return

    setIsLoading(true)
    setError(null)
    setSmartResult(null)

    try {
      const response = await fetch('/api/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: smartQuery })
      })

      const data = await response.json()

      if (data.error) {
        setError(data.error)
      } else {
        setSmartResult(data)
        const historyEntry = `${smartQuery} = ${data.result}`
        setHistory(prev => [historyEntry, ...prev].slice(0, 20))
      }
    } catch (err) {
      setError('Failed to connect to solver. Please check your internet connection.')
    } finally {
      setIsLoading(false)
    }
  }

  const inputDigit = (digit) => {
    if (waitingForOperand) {
      setDisplay(digit)
      setWaitingForOperand(false)
    } else {
      setDisplay(display === '0' ? digit : display + digit)
    }
    setError(null)
  }

  const inputDecimal = () => {
    if (waitingForOperand) {
      setDisplay('0.')
      setWaitingForOperand(false)
      return
    }
    if (!display.includes('.')) {
      setDisplay(display + '.')
    }
  }

  const clearDisplay = () => {
    setDisplay('0')
    setPreviousValue(null)
    setOperator(null)
    setWaitingForOperand(false)
    setError(null)
  }

  const performOperation = (nextOperator) => {
    const inputValue = parseFloat(display)

    if (previousValue === null) {
      setPreviousValue(inputValue)
    } else if (operator) {
      const currentValue = previousValue || 0
      const newValue = calculate(currentValue, inputValue, operator)

      setPreviousValue(newValue)
      setDisplay(String(newValue))

      const historyEntry = `${currentValue} ${operator} ${inputValue} = ${newValue}`
      setHistory(prev => [historyEntry, ...prev].slice(0, 20))
    }

    setWaitingForOperand(true)
    setOperator(nextOperator)
    setError(null)
  }

  const calculate = (firstValue, secondValue, op) => {
    switch (op) {
      case '+': return firstValue + secondValue
      case '-': return firstValue - secondValue
      case '*': return firstValue * secondValue
      case '/': return secondValue !== 0 ? firstValue / secondValue : 0
      case '^': return Math.pow(firstValue, secondValue)
      default: return secondValue
    }
  }

  const performScientific = (func) => {
    const inputValue = parseFloat(display)
    let result
    let label

    switch (func) {
      case 'sin':
        result = Math.sin(inputValue)
        label = `sin(${display})`
        break
      case 'cos':
        result = Math.cos(inputValue)
        label = `cos(${display})`
        break
      case 'tan':
        result = Math.tan(inputValue)
        label = `tan(${display})`
        break
      case 'sqrt':
        result = Math.sqrt(inputValue)
        label = `√(${display})`
        break
      case 'log':
        result = Math.log10(inputValue)
        label = `log(${display})`
        break
      case 'ln':
        result = Math.log(inputValue)
        label = `ln(${display})`
        break
      default:
        return
    }

    if (isNaN(result) || !isFinite(result)) {
      setError('Error')
      setTimeout(() => setError(null), 2000)
      return
    }

    result = parseFloat(result.toFixed(10))
    setDisplay(String(result))
    setWaitingForOperand(true)

    const historyEntry = `${label} = ${result}`
    setHistory(prev => [historyEntry, ...prev].slice(0, 20))
  }

  const performEquals = () => {
    const inputValue = parseFloat(display)

    if (operator && previousValue !== null) {
      const newValue = calculate(previousValue, inputValue, operator)

      if (isNaN(newValue) || !isFinite(newValue)) {
        setError('Error')
        setTimeout(() => setError(null), 2000)
        return
      }

      const finalValue = parseFloat(newValue.toFixed(10))

      const historyEntry = `${previousValue} ${operator} ${inputValue} = ${finalValue}`
      setHistory(prev => [historyEntry, ...prev].slice(0, 20))

      setDisplay(String(finalValue))
      setPreviousValue(null)
      setOperator(null)
      setWaitingForOperand(true)
    }
  }

  const inputConstant = (constant) => {
    const value = constant === 'pi' ? Math.PI : Math.E
    setDisplay(String(value))
    setWaitingForOperand(true)
  }

  const handleParenthesis = (paren) => {
    if (waitingForOperand) {
      setDisplay(paren)
      setWaitingForOperand(false)
    } else {
      setDisplay(display + paren)
    }
  }

  const handleBackspace = () => {
    if (display.length > 1) {
      setDisplay(display.slice(0, -1))
    } else {
      setDisplay('0')
    }
  }

  const toggleHistory = () => {
    setShowHistory(!showHistory)
    setShowScientific(false)
    setShowSmartSolve(false)
  }

  const toggleScientific = () => {
    setShowScientific(!showScientific)
    setShowHistory(false)
    setShowSmartSolve(false)
  }

  const toggleSmartSolve = () => {
    setShowSmartSolve(!showSmartSolve)
    setShowHistory(false)
    setShowScientific(false)
    setSmartResult(null)
    setSmartQuery('')
    setError(null)
  }

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (showSmartSolve) {
        if (e.key === 'Enter' && smartQuery.trim()) {
          solveWithWolfram()
        }
        return
      }
      if (e.key >= '0' && e.key <= '9') inputDigit(e.key)
      if (e.key === '.') inputDecimal()
      if (e.key === '+') performOperation('+')
      if (e.key === '-') performOperation('-')
      if (e.key === '*') performOperation('*')
      if (e.key === '/') { e.preventDefault(); performOperation('/') }
      if (e.key === 'Enter' || e.key === '=') performEquals()
      if (e.key === 'Escape') clearDisplay()
      if (e.key === 'Backspace') handleBackspace()
      if (e.key === '^') performOperation('^')
      if (e.key === '(') handleParenthesis('(')
      if (e.key === ')') handleParenthesis(')')
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [display, previousValue, operator, waitingForOperand, showSmartSolve, smartQuery])

  return (
    <div className="calculator-container">
      <div className="calculator-wrapper">
        <h1 className="calculator-title">Calculator</h1>

        <div className="top-controls">
          <button 
            className={`control-btn ${showScientific ? 'active' : ''}`}
            onClick={toggleScientific}
            title="Toggle scientific functions"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
            {showScientific ? 'Basic' : 'Scientific'}
          </button>

          <button 
            className={`control-btn ${showSmartSolve ? 'active' : ''}`}
            onClick={toggleSmartSolve}
            title="AI-powered math solver"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
              <path d="M2 17l10 5 10-5"></path>
              <path d="M2 12l10 5 10-5"></path>
            </svg>
            Smart Solve
          </button>

          <button 
            className={`voice-btn ${isListening ? 'listening' : ''}`}
            onClick={toggleVoiceInput}
            title="Voice input"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          </button>

          <button 
            className={`control-btn ${showHistory ? 'active' : ''}`}
            onClick={toggleHistory}
            title="Toggle history"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            History
          </button>
        </div>

        {apiStatus === 'offline' && (
          <div className="api-status offline">
            ⚠️ Solver offline — check server connection
          </div>
        )}

        {error && <div className="error-banner">{error}</div>}

        {showSmartSolve ? (
          <div className="smart-solve-panel">
            <div className="smart-solve-header">
              <h3>🧠 Smart Solve</h3>
              <p>Ask any math question in natural language</p>
              {smartResult?.cached && <span className="cached-badge">⚡ Cached</span>}
            </div>

            <div className="smart-input-group">
              <input
                type="text"
                className="smart-input"
                placeholder="e.g., derivative of x^2 + 3x, solve 2x + 5 = 15..."
                value={smartQuery}
                onChange={(e) => setSmartQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && solveWithWolfram()}
              />
              <button 
                className="smart-solve-btn"
                onClick={solveWithWolfram}
                disabled={isLoading || !smartQuery.trim()}
              >
                {isLoading ? (
                  <span className="spinner"></span>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    Solve
                  </>
                )}
              </button>
            </div>

            <div className="smart-examples">
              <span className="example-label">Try:</span>
              {['derivative of x^2', 'solve x^2 - 4 = 0', 'integral of sin(x)', 'factor x^2 - 9', 'limit of sin(x)/x as x->0'].map((ex) => (
                <button key={ex} className="example-chip" onClick={() => setSmartQuery(ex)}>
                  {ex}
                </button>
              ))}
            </div>

            {smartResult && (
              <div className="smart-result">
                <div className="result-label">Result</div>
                <div className="result-value">{smartResult.result}</div>

                {smartResult.additionalResults && smartResult.additionalResults.length > 0 && (
                  <div className="additional-results">
                    {smartResult.additionalResults.map((res, idx) => (
                      <div key={idx} className="additional-result">
                        <span className="additional-title">{res.title}:</span>
                        <span className="additional-text">{res.text}</span>
                      </div>
                    ))}
                  </div>
                )}

                {smartResult.image && (
                  <img src={smartResult.image} alt="Solution visualization" className="result-image" />
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="display-section">
              <div className="history-preview">
                {history.length > 0 && !showHistory && (
                  <div className="history-item">{history[0]}</div>
                )}
              </div>
              <div className="main-display">
                {display}
              </div>
              <div className="operator-indicator">
                {operator && <span className="active-op">{operator}</span>}
              </div>
            </div>

            {showScientific && (
              <div className="scientific-panel">
                <div className="scientific-row">
                  <button className="btn sci" onClick={() => performScientific('sin')}>sin</button>
                  <button className="btn sci" onClick={() => performScientific('cos')}>cos</button>
                  <button className="btn sci" onClick={() => performScientific('tan')}>tan</button>
                  <button className="btn sci" onClick={() => performScientific('sqrt')}>√</button>
                </div>
                <div className="scientific-row">
                  <button className="btn sci" onClick={() => performScientific('log')}>log</button>
                  <button className="btn sci" onClick={() => performScientific('ln')}>ln</button>
                  <button className="btn sci" onClick={() => inputConstant('pi')}>π</button>
                  <button className="btn sci" onClick={() => inputConstant('e')}>e</button>
                </div>
                <div className="scientific-row">
                  <button className="btn sci" onClick={() => handleParenthesis('(')}>(</button>
                  <button className="btn sci" onClick={() => handleParenthesis(')')}>)</button>
                  <button className="btn sci" onClick={() => performOperation('^')}>x^y</button>
                  <button className="btn sci" onClick={handleBackspace}>⌫</button>
                </div>
              </div>
            )}

            <div className="basic-keypad">
              <div className="keypad-row">
                <button className="btn clear" onClick={clearDisplay}>AC</button>
                <button className="btn operator" onClick={() => performOperation('/')}>÷</button>
                <button className="btn operator" onClick={() => performOperation('*')}>×</button>
                <button className="btn operator" onClick={() => performOperation('-')}>−</button>
              </div>

              <div className="keypad-row">
                <button className="btn number" onClick={() => inputDigit('7')}>7</button>
                <button className="btn number" onClick={() => inputDigit('8')}>8</button>
                <button className="btn number" onClick={() => inputDigit('9')}>9</button>
                <button className="btn operator" onClick={() => performOperation('+')}>+</button>
              </div>

              <div className="keypad-row">
                <button className="btn number" onClick={() => inputDigit('4')}>4</button>
                <button className="btn number" onClick={() => inputDigit('5')}>5</button>
                <button className="btn number" onClick={() => inputDigit('6')}>6</button>
                <button className="btn equals" onClick={performEquals}>=</button>
              </div>

              <div className="keypad-row">
                <button className="btn number" onClick={() => inputDigit('1')}>1</button>
                <button className="btn number" onClick={() => inputDigit('2')}>2</button>
                <button className="btn number" onClick={() => inputDigit('3')}>3</button>
                <button className="btn number" onClick={() => inputDigit('0')}>0</button>
              </div>

              <div className="keypad-row">
                <button className="btn number zero" onClick={() => inputDigit('0')}>0</button>
                <button className="btn number" onClick={inputDecimal}>.</button>
              </div>
            </div>
          </>
        )}

        {showHistory && (
          <div className="history-panel">
            <div className="history-header">
              <h3>Calculation History</h3>
              {history.length > 0 && (
                <button className="clear-history" onClick={() => setHistory([])}>Clear</button>
              )}
            </div>
            {history.length === 0 ? (
              <div className="empty-history">No calculations yet</div>
            ) : (
              <div className="history-list">
                {history.map((entry, index) => (
                  <div key={index} className="history-entry">{entry}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default App