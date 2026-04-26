import { type VoidComponent } from '@/react-shared'

const Loading: VoidComponent = () => {
  return (
    <div className="astroneum-loading">
      <i className="circle1" />
      <i className="circle2" />
      <i className="circle3" />
    </div>
  )
}

export default Loading
