export default function LoginFailed() {
  const urlParams = new URLSearchParams(window.location.search);
  const error = urlParams.get('error');
  
  const getErrorMessage = () => {
    switch (error) {
      case 'apple_not_configured':
        return 'Apple Sign-In is not currently available. Please use Google Sign-In instead.';
      default:
        return 'There was an issue with your sign-in. Please try again.';
    }
  };

  const getErrorTitle = () => {
    switch (error) {
      case 'apple_not_configured':
        return 'Apple Sign-In Unavailable';
      default:
        return 'Login Failed';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full mx-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-exclamation-triangle text-red-600 text-2xl"></i>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{getErrorTitle()}</h1>
          <p className="text-gray-600 mb-6">
            {getErrorMessage()}
          </p>
          <button
            onClick={() => window.close()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
}