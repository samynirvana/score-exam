import re
import streamlit as st

def get_direct_url(url):
    pattern = r"(?:/d/|id=)([-_a-zA-Z0-9]+)"
    match = re.search(pattern, url)
    return f"https://lh3.googleusercontent.com/d/{match.group(1)}" if match else None

st.title("Google Drive Direct Link Generator")

url_input = st.text_input("Paste Google Drive Sharing URL:")

if url_input:
    direct_link = get_direct_url(url_input)
    if direct_link:
        st.success("Direct Link Generated!")
        st.code(direct_link, language="text")
        st.image(direct_link, caption="Direct Image Preview")
    else:
        st.error("Invalid URL. Could not parse File ID.")

import sys
from streamlit.web import cli as stcli

if __name__ == "__main__":
    sys.argv = ["streamlit", "run", __file__]
    sys.exit(stcli.main())