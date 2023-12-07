import { fetch, setGlobalDispatcher, Agent } from 'undici'

setGlobalDispatcher(new Agent({ connect: { timeout: 600_000 } }) )

class GoogleBuinessApi {
  constructor() {
    this.access_token = ''
    this.cacheRecords = {}

    /** use to filter account in accounts */
    this.defaultAccountName = 'YOUR_ACCOUNT_NAME'
    /** use to filter location in locations */
    this.defaultWebSiteUri = 'YOUR_SITE_URI'
  }

  /**
   * Use Google OAuth2.0 Playground generate refresh token to fetch data without OAuth2.0 dialog
   * 
   * refresh_token: see https://www.youtube.com/watch?v=hfWe1gPCnzc
   * client_id: from the API console OAuth2.0
   * client_secret: from the API console OAuth2.0
   * url: see https://developers.google.com/identity/protocols/OAuth2WebServer#offline
   * 
   * @returns {Object} 
   *          response Post to the refresh endpoint, parse the json response and return the access token.
   * @returns {string} 
   *          response.access_token Google OAuth2.0 playground access_token.
   * @returns {number} 
   *          response.expires_in Google OAuth2.0 playground access_token expires.
   * @returns {string} 
   *          response.scope Google OAuth2.0 playground access_token scope(Step 1).
   * @returns {string} 
   *          response.token_type
   */
  async getAccessTokenUsingRefreshTokenFromGoogleOAuthPlayground() {
    const refresh_token = "YOUR_REFRESH_TOKEN";
    const client_id = "YOUR_CLIENT_ID";
    const client_secret = "YOUR_CLIENT_SECRET";
    const url = "https://www.googleapis.com/oauth2/v4/token";
    // scopes inputed in oauth2.0 playground, so this is not need
    // const scopes = [
    //   'https://www.googleapis.com/auth/business.manage'
    // ];
    const options = {
        // body: `scope=${encodeURIComponent(scopes)}&grant_type=refresh_token&client_id=${encodeURIComponent(client_id)}&client_secret=${encodeURIComponent(client_secret)}&refresh_token=${encodeURIComponent(refresh_token)}`,
        body: `grant_type=refresh_token&client_id=${encodeURIComponent(client_id)}&client_secret=${encodeURIComponent(client_secret)}&refresh_token=${encodeURIComponent(refresh_token)}`,
        method: "POST",
        headers: new Headers({
          'Content-Type': 'application/x-www-form-urlencoded'
        }),
        signal: AbortSignal.timeout(600000)
    }

    const response = await fetch(url, options)
    const responseAsJson = await response.json()
    return responseAsJson
  }

  async cacheAccessToken() {
    const { access_token } = await this.getAccessTokenUsingRefreshTokenFromGoogleOAuthPlayground()
    if(access_token) {
      this.access_token = access_token
    }
  }

  cacheRecord(key, value) {
    this.cacheRecords = {
      ...this.cacheRecords,
      [key]: value
    }
  }

  get accountName() {
    if(this.cacheRecords['accounts']) {
      return this.cacheRecords['accounts'].find(account => account.accountName === this.defaultAccountName)?.name
    }else{
      console.warn('Please invoke fetchAccounts')
      return ''
    }
  }

  get locationName() {
    if(this.cacheRecords['locations']) {
      return this.cacheRecords['locations'].find(location => location.websiteUri === this.defaultWebSiteUri)?.name
    }else{
      console.warn('Please invoke fetchLocations')
      return ''
    }
  }

  async fetchAccounts() {
    await this.cacheAccessToken()

    if(this.access_token) {
      const url = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts"
      const options = {
        method: "GET",
        headers: new Headers({
            Authorization: `Bearer ${this.access_token}`
        }),
        signal: AbortSignal.timeout(600000)
      }

      const response = await fetch(url, options)
      const responseAsJson = await response.json()
      if(responseAsJson.accounts) {
        this.cacheRecord('accounts', responseAsJson.accounts)
      }
      return responseAsJson
    }

    return {}
  }

  async fetchLocations() {
    const { accounts } = await this.fetchAccounts()

    if(this.access_token && accounts) {
      // const url = "https://mybusinessbusinessinformation.googleapis.com/v1/{accountName}/locations?readMask=storeCode,regularHours,name,languageCode,title,phoneNumbers,categories,storefrontAddress,websiteUri,regularHours,specialHours,serviceArea,labels,adWordsLocationExtensions,latlng,openInfo,metadata,profile,relationshipData,moreHours"
      const url = "https://mybusinessbusinessinformation.googleapis.com/v1/{accountName}/locations?readMask=name,title,websiteUri,metadata"
      const options = {
        method: "GET",
        headers: new Headers({
            Authorization: `Bearer ${this.access_token}`
        }),
        signal: AbortSignal.timeout(600000)
      }

      const response = await fetch(url.replace('{accountName}', this.accountName), options)
      const responseAsJson = await response.json()
      if(responseAsJson.locations) {
        this.cacheRecord('locations', responseAsJson.locations)
      }
      return responseAsJson
    }
    
    return {}
  }

  async fetchReviews(params = {}) {
    const { pageSize = 30, orderBy = 'updateTime desc', isFetchAll = false, reviews = [], pageToken = '' } = params

    if(isFetchAll) {
      let locations = this.cacheRecords['locations']
      if(!locations) {
        locations = await this.fetchLocations()
      }

      if(this.access_token && locations && this.accountName) {
        const pageTokenUrlParam = pageToken ? `&pageToken=${pageToken}` : ''
        const url = `https://mybusiness.googleapis.com/v4/${this.accountName}/{locationName}/reviews?pageSize=${pageSize}&orderBy=${orderBy}${pageTokenUrlParam}`
        const options = {
          method: "GET",
          headers: new Headers({
              Authorization: `Bearer ${this.access_token}`
          }),
          signal: AbortSignal.timeout(600000)
        }

        const response = await fetch(url.replace('{locationName}', this.locationName), options)
        const responseAsJson = await response.json()
        if(responseAsJson.nextPageToken) {
          return this.fetchReviews({
            isFetchAll,
            reviews: [...reviews, ...responseAsJson.reviews],
            pageToken: responseAsJson.nextPageToken,
            pageSize
          })
        }else{
          return {
            ...responseAsJson,
            reviews: [...reviews, ...responseAsJson.reviews]
          }
        }
      }
      
      return {}

    }else{
      const { locations } = await this.fetchLocations()

      if(this.access_token && locations && this.accountName) {
        const url = `https://mybusiness.googleapis.com/v4/${this.accountName}/{locationName}/reviews?pageSize=${pageSize}&orderBy=${orderBy}`
        const options = {
          method: "GET",
          headers: new Headers({
              Authorization: `Bearer ${this.access_token}`
          }),
          signal: AbortSignal.timeout(600000)
        }

        const response = await fetch(url.replace('{locationName}', this.locationName), options)
        const responseAsJson = await response.json()
        return responseAsJson
      }
      
      return {}
    }
  }
}

async function fetchReviews() {
  const googleBuinessApi = new GoogleBuinessApi()
  const googleReviews = await googleBuinessApi.fetchReviews({
    pageSize: 50,
    isFetchAll: true
  })

  console.log({
    googleReviews
  })
}

fetchReviews()
