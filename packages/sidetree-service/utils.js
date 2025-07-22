/**
 * Converts Sidetree status codes to HTTP status codes
 */
function convertSidetreeStatusToHttpStatus(sidetreeStatus) {
    const statusMap = {
      // Success responses
      'succeeded': 200,
      'success': 200,
      
      // Client errors
      'bad_request': 400,
      'invalid_request': 400,
      'invalid_operation': 400,
      'invalid_did_document': 400,
      'invalid_public_key': 400,
      'invalid_signature': 400,
      'invalid_patch': 400,
      'invalid_delta': 400,
      'invalid_suffix_data': 400,
      'invalid_operation_type': 400,
      'invalid_multihash': 400,
      'invalid_commitment': 400,
      'invalid_reveal_value': 400,
      'invalid_encoded_string': 400,
      'invalid_json': 400,
      'missing_property': 400,
      'property_not_string': 400,
      'property_not_object': 400,
      'property_not_array': 400,
      'array_size_exceeds_limit': 400,
      'string_too_long': 400,
      'unauthorized': 401,
      'forbidden': 403,
      'not_found': 404,
      'did_not_found': 404,
      'operation_not_found': 404,
      'anchor_file_not_found': 404,
      'map_file_not_found': 404,
      'chunk_file_not_found': 404,
      'provisional_index_file_not_found': 404,
      'core_index_file_not_found': 404,
      'conflict': 409,
      'duplicate_operation': 409,
      'method_not_allowed': 405,
      'not_acceptable': 406,
      'request_timeout': 408,
      'payload_too_large': 413,
      'unsupported_media_type': 415,
      'too_many_requests': 429,
      
      // Server errors
      'server_error': 500,
      'internal_server_error': 500,
      'not_implemented': 501,
      'bad_gateway': 502,
      'service_unavailable': 503,
      'gateway_timeout': 504,
      'blockchain_unavailable': 503,
      'cas_unavailable': 503,
      'database_unavailable': 503,
      'ipfs_unavailable': 503
    };
  
    // Handle different input types
    if (typeof sidetreeStatus === 'number') {
      // If it's already a number, assume it's an HTTP status
      return sidetreeStatus;
    }
  
    if (typeof sidetreeStatus === 'string') {
      const status = statusMap[sidetreeStatus.toLowerCase()];
      return status || 500; // Default to 500 for unknown statuses
    }
  
    if (typeof sidetreeStatus === 'object' && sidetreeStatus.code) {
      const status = statusMap[sidetreeStatus.code.toLowerCase()];
      return status || 500;
    }
  
    // Default fallback
    return 500;
  }
  
  module.exports = {
    convertSidetreeStatusToHttpStatus
  };