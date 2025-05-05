/**
 * Converts a string from snake_case or PascalCase to camelCase.
 * Examples:
 *   'hello_world' -> 'helloWorld'
 *   'HelloWorld' -> 'helloWorld'
 *   'alreadyCamel' -> 'alreadyCamel'
 *   'Seq_in_index' -> 'seqInIndex'
 *   'Non_unique' -> 'nonUnique'
 *   'Key_name' -> 'keyName'
 *
 * @param str The input string.
 * @returns The camelCased string.
 */
export function toCamelCase(str: string): string {
  if (!str) {
    return str;
  }

  // Handle snake_case and potentially mixed cases like 'Seq_in_index'
  let result = str.replace(/([-_][a-z])/gi, ($1) => {
    return $1.toUpperCase().replace('-', '').replace('_', '');
  });

  // Handle PascalCase by lowercasing the first letter if it's followed by a lowercase letter
  // This avoids changing acronyms like 'URL' to 'uRL' if they were the start of a key
  if (result.length > 0 && result[0] === result[0].toUpperCase() && result.length > 1 && result[1] === result[1].toLowerCase()) {
     result = result.charAt(0).toLowerCase() + result.slice(1);
  }

  // Ensure the first character is always lowercase unless it's a single character string
  if (result.length > 1 && result[0] === result[0].toUpperCase()) {
      // Check if the whole string is uppercase (like an acronym) - leave it if so
      if (result !== result.toUpperCase()) {
          result = result.charAt(0).toLowerCase() + result.slice(1);
      }
  } else if (result.length === 1) {
      result = result.toLowerCase();
  }


  return result;
}